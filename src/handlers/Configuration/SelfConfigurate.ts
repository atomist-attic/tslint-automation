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
    return (project: Project) => {
// TODO: make this use TS AST so linebreaks won't bother it
        return project.findFile("src/handlers/PushToTsLinting.ts").then(
            f => f.getContent().then(content => {
                if (content.match(whereToAdd)) {
                    return f.setContent(content.replace(
                        // how do I put $0 in the replacement? maybe ya hafta put it in a group
                        /PeopleWhoDoNotWantMeToOfferToHelp(.*)"${person}",?/,
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
        const reportError = reportErrorFunction(context, parameters);
        // someday, parse reporef from package json
        return initialReport(context, parameters)
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
                    .then(analysis => finalReport(context, parameters, analysis)),
                reportError("Failed to clone"))
            .then(() => Success, error => Failure);
    }

    public freshParametersInstance(): StopBotheringMeParams {
        return new StopBotheringMeParams();
    }
}


@CommandHandler("Start offering to help the invoking user", "start offering to help with linting errors")
export class DoOfferToHelp implements HandleCommand<StopBotheringMeParams> {

    public handle(context: HandlerContext, parameters: StopBotheringMeParams): Promise<HandlerResult> {
        const messageId = "stop-bothering-" + parameters.screenName;
        const reportError = reportErrorFunction(context, parameters);
        // someday, parse reporef from package json
        return initialReport(context, parameters)
            .then(() => context.messageClient.respond(
                "OK. I'll update my program and offer to help when I can."))
            .then(() =>
                GitCommandGitProject.cloned(adminCreds, new GitHubRepoRef(MyGitHubOrganization, MyGitHubRepository)))
            .then(project => removePersonWhoDoesNotWantMeToOfferToHelp(parameters.screenName)(project, context)
                    .then(editResult => {
                            if (editResult.success && editResult.edited) {
                                return project.commit(`${parameters.screenName} wants me to offer to help

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
                    .then(analysis => finalReport(context, parameters, analysis)),
                reportError("Failed to clone"))
            .then(() => Success, error => Failure);
    }

    public freshParametersInstance(): StopBotheringMeParams {
        return new StopBotheringMeParams();
    }
}


export function isMine(commit: { message: string }): boolean {
    logger.info("considering commit message: " + commit.message);
    return !!commit.message.match(/\[atomist:(stop-bothering-\S*)\]/);
}

export function parseMessageId(commitMessage: string) {
    const match = commitMessage.match(/\[atomist:(stop-bothering-\S*)\]/);
    if (!match) {
        throw new Error("I don't recognize this commit message: " + commitMessage);
    }
    return match[1];
}

function initialReport(context: HandlerContext, parameters: StopBotheringMeParams) {
    return context.messageClient.addressUsers(`Sad day: ${parameters.screenName} invoked StopBotheringMe.`,
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

function reportErrorFunction(context: HandlerContext, parameters: StopBotheringMeParams) {
    return (message: string) => (error: Error) => {
        const attachment: slack.Attachment = {
            fallback: "report",
            color: "#bb2510",
            fields: fields(["message"], ["error"],
                { error, message }),
        };
        const slackMessage: slack.SlackMessage = {
            text: `${parameters.screenName} invoked StopBotheringMe.`,
            attachments: [attachment],
        };
        return context.messageClient.addressUsers(slackMessage, adminSlackUserNames, { id: context.correlationId })
            .then(() => Promise.reject(error));
    };
}

function finalReport(context: HandlerContext, parameters: StopBotheringMeParams,
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
        text: `${parameters.screenName} invoked StopBotheringMe.`,
        attachments: [attachment],
    };
    return context.messageClient.addressUsers(message, adminSlackUserNames, { id: context.correlationId });
}

function fields(shortOnes: string[], longOnes: string[], source: object) {
    const shorts = shortOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: true }));
    const longs = longOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: false }));

    return shorts.concat(longs);
}
