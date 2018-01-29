import {
    CommandHandler, Failure,
    HandleCommand, HandlerContext, HandlerResult, logger, MappedParameter, MappedParameters, Parameter, Secret, Secrets,
    Success,
} from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { EditResult, failedEdit, ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitStatus } from "@atomist/automation-client/project/git/gitStatus";
import { Project } from "@atomist/automation-client/project/Project";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { adminChannelId, adminCreds, adminSlackUserNames } from "../../credentials";

const whereToAdd = /PeopleWhoDoNotWantMeToOfferToHelp *= *\[/;

export function addPersonWhoDoesNotWantMeToOfferToHelp(person: string): ProjectEditor {
    return (project: Project) => {
// can I ask, where is this file I'm in right now?
        return project.findFile("src/handlers/PushToTsLinting.ts").then(
            f => f.getContent().then(content => {
                if (content.match(whereToAdd)) {
                    return f.setContent(content.replace(whereToAdd,
                        // how do I put $0 in the replacement? maybe ya hafta put it in a group
                        `PeopleWhoDoNotWantMeToOfferToHelp = ["${person}", `))
                        .then(() => successfulEdit(project, true));
                } else {
                    return Promise.resolve(failedEdit(project, new Error("Didn't find the place to add them")));
                }
            }), findFileError => Promise.resolve(failedEdit(project, findFileError)));
    };
}

export function removePersonWhoDoesNotWantMeToOfferToHelp(person: string): ProjectEditor {
    const r = new RegExp(`PeopleWhoDoNotWantMeToOfferToHelp(.*)"${person}",?`);
    return (project: Project) => {
// TODO: make this use TS AST so linebreaks won't bother it
        return project.findFile("src/handlers/PushToTsLinting.ts").then(
            f => f.getContent().then(content => {
                if (content.match(whereToAdd)) {
                    return f.setContent(content.replace(r,
                        `PeopleWhoDoNotWantMeToOfferToHelp$1`))
                        .then(() => successfulEdit(project, true));
                } else {
                    return Promise.resolve(failedEdit(project, new Error("Didn't find the place to add them")));
                }
            }), findFileError => Promise.resolve(failedEdit(project, findFileError)));
    };
}

@Parameters()
export class StopBotheringMeParams {
    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

}

const MyGitHubOrganization = "atomist";
const MyGitHubRepository = "tslint-automation";

interface Analysis {
    pushed: boolean;
    editResult?: EditResult;
    messageId: string;
    sha?: string;
    error?: Error;
    message?: string;
}

@CommandHandler("Stop offering to help the invoking user", "stop offering to help with linting errors")
export class StopBotheringMe implements HandleCommand<StopBotheringMeParams> {

    public handle(context: HandlerContext, parameters: StopBotheringMeParams): Promise<HandlerResult> {
        const messageId = "stop-bothering-" + parameters.screenName;
        const me = { commandName: "StopBotheringMe" };
        const reportError = reportErrorFunction(context, parameters, me);
        // someday, parse reporef from package json
        return initialReport(context, parameters, me)
            .then(() => context.messageClient.respond(
                "OK. I'll update my program and not offer again. If you change your mind, post in " + slack.channel(adminChannelId)))
            .then(() =>
                GitCommandGitProject.cloned(adminCreds, new GitHubRepoRef(MyGitHubOrganization, MyGitHubRepository)))
            .then(project => addPersonWhoDoesNotWantMeToOfferToHelp(parameters.screenName)(project, context)
                    .then(editResult => {
                            if (editResult.success && editResult.edited) {
                                return project.commit(`${parameters.screenName} doesn't want me to offer to help

[atomist:${messageId}]`)
                                    .then(() => project.push(), reportError("commit failed"))
                                    .then(() => project.gitStatus(), reportError("push failed"))
                                    .then((gs: GitStatus) =>
                                            reportProgress(context, parameters.screenName, messageId, { sha: gs.sha })
                                                .then(() => ({ pushed: true, editResult, messageId, sha: gs.sha })),
                                        reportError("git status failed"));
                            } else {
                                return Promise.resolve({ pushed: false, editResult, messageId });
                            }
                        },
                        reportError("editor threw an exception"))
                    .then(analysis => finalReport(context, parameters, me, analysis)),
                reportError("Failed to clone"))
            .then(() => Success, error => Failure);
    }

    public freshParametersInstance(): StopBotheringMeParams {
        return new StopBotheringMeParams();
    }
}

@CommandHandler("Start offering to help the invoking user", "start offering to help with linting errors")
export class DoOfferToHelp implements HandleCommand<StopBotheringMeParams> {

    public async handle(context: HandlerContext, parameters: StopBotheringMeParams): Promise<HandlerResult> {
        const messageId = "tslint-automation/do-offer-to-help-" + parameters.screenName;
        const me = { commandName: "DoOfferToHelp" };
        const reportError = reportErrorFunction(context, parameters, me);
        // someday, parse reporef from package json
        await initialReport(context, parameters, me);
        await context.messageClient.respond(
            "OK. I'll update my program and offer to help when I can.")
        ;
        const project = await     GitCommandGitProject.cloned(adminCreds, new GitHubRepoRef(MyGitHubOrganization, MyGitHubRepository))
            .catch(reportError("Failed to clone"));
        const editResult = await removePersonWhoDoesNotWantMeToOfferToHelp(parameters.screenName)(project, context)
            .catch(reportError("editor threw an exception"));
        if (editResult.success && editResult.edited) {
            await project.commit(`${parameters.screenName} wants me to offer to help

[atomist:${messageId}]`).catch(reportError("commit failed"));
            await project.push().catch(reportError("push failed"));
            const gs = await project.gitStatus().catch(
                reportError("git status failed"));
            await reportProgress(context, parameters.screenName, messageId, { sha: gs.sha });
            await finalReport(context, parameters, me,
                { pushed: true, editResult, messageId, sha: gs.sha });
        } else {
            await finalReport(context, parameters,me,  { pushed: false, editResult, messageId });
        }
        return Success;
    }

    public freshParametersInstance(): StopBotheringMeParams {
        return new StopBotheringMeParams();
    }
}

export function isMine(commit: { message: string }): boolean {
    logger.info("considering commit message: " + commit.message);
    return !!commit.message.match(/\[atomist:(stop-bothering-\S*)\]/)
        && !!commit.message.match(/\[atomist:(do-offer-to-help-\S*)\]/);
}

export function parseMessageId(commitMessage: string) {
    const match = commitMessage.match(/\[atomist:(stop-bothering-\S*)\]/) ||
        commitMessage.match(/\[atomist:(do-offer-to-help-\S*)\]/);
    if (!match) {
        throw new Error("I don't recognize this commit message: " + commitMessage);
    }
    return match[1];
}

function initialReport(context: HandlerContext, parameters: StopBotheringMeParams, opts: { commandName: string }) {
    return context.messageClient.addressUsers(`${parameters.screenName} invoked ${opts.commandName}.`,
        adminSlackUserNames, { id: context.correlationId });
}

export function reportProgress(context: HandlerContext,
                               screenName: string,
                               messageId: string,
                               details: {
                                   sha: string, buildUrl?: string,
                                   buildStatusEmoji?: string,
                               }) {
    console.log("Addressing user: " + screenName);
    const buildEmoji = details.buildStatusEmoji || ":empty-orange-square:";
    const buildMessage = details.buildUrl ? slack.url(details.buildUrl, "Build") :
        "Build";
    // I wanted to send this in a DM but it is not updatable then.
    return context.messageClient.addressChannels(
        `Dear ${screenName}: I have changed my programming to avoid offering to help with your linting errors in the future.
:white_check_mark: ${linkToCommit(details)}
${buildEmoji} ${buildMessage}
:empty-orange-square: Deploy`,
        adminChannelId,
        { id: messageId },
    );
}

function linkToCommit(details: { sha?: string }): string {
    if (details.sha) {
        return slack.url(
            `https://github.com/${MyGitHubOrganization}/${MyGitHubRepository}/commit/${details.sha}`,
            "Code change");
    } else {
        return "(no commit sha)";
    }
}

function reportErrorFunction(context: HandlerContext, parameters: StopBotheringMeParams, opts: { commandName: string }) {
    return (message: string) => (error: Error) => {
        const attachment: slack.Attachment = {
            fallback: "report",
            color: "#bb2510",
            fields: fields(["message"], ["error"],
                { error, message }),
        };
        const slackMessage: slack.SlackMessage = {
            text: `${parameters.screenName} invoked ${opts.commandName}.`,
            attachments: [attachment],
        };
        return context.messageClient.addressUsers(slackMessage, adminSlackUserNames, { id: context.correlationId })
            .then(() => Promise.reject(error));
    };
}

function finalReport(context: HandlerContext, parameters: StopBotheringMeParams, opts: { commandName: string },
                     analysis: Analysis) {
    const attachment: slack.Attachment = {
        fallback: "report",
        color: "#20aa00",
        fields: fields(["edited", "messageId"], ["commit"],
            {
                ...analysis, commit: linkToCommit(analysis),
                edited: analysis.editResult.edited,
            }),
    };
    const message: slack.SlackMessage = {
        text: `${parameters.screenName} invoked ${opts.commandName}.`,
        attachments: [attachment],
    };
    return context.messageClient.addressUsers(message, adminSlackUserNames, { id: context.correlationId });
}

function fields(shortOnes: string[], longOnes: string[], source: object) {
    const shorts = shortOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: true }));
    const longs = longOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: false }));

    return shorts.concat(longs);
}
