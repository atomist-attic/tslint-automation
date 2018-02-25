import {
    CommandHandler, EventFired, failure, Failure, HandleCommand, HandleEvent, HandlerContext, HandlerResult,
    logger, Secrets,
} from "@atomist/automation-client";
import { EventHandler, Secret } from "@atomist/automation-client/decorators";
import * as GraphQL from "@atomist/automation-client/graph/graphQL";
import { logger } from "@atomist/automation-client/internal/util/logger";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { ProjectOperationCredentials } from "@atomist/automation-client/operations/common/ProjectOperationCredentials";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { GitStatus } from "@atomist/automation-client/project/git/gitStatus";
import { Project } from "@atomist/automation-client/project/Project";
import { buttonForCommand, MessageOptions } from "@atomist/automation-client/spi/message/MessageClient";
import { Action } from "@atomist/slack-messages/SlackMessages";
import * as slack from "@atomist/slack-messages/SlackMessages";
import { exec } from "child-process-promise";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import * as path from "path";
import { Options, run } from "tslint/lib/runner";
import { configuration } from "../atomist.config";
import { adminChannelId } from "../credentials";
import * as graphql from "../typings/types";
import { getFileContentFromProject } from "../util/getFileContent";
import { Location, RuleFailure } from "./aboutTsLint";
import { InsertAboveLineParameters } from "./BittyEditors/InsertAboveLine";
import { BranchInRepoParameters } from "./BranchInRepoParameters";
import { RecognizedError, recognizeError } from "./recognizedErrors";

export const PeopleWhoWantLintingOnTheirBranches = ["cd", "clay"];
export const PeopleWhoDoNotWantMeToOfferToHelp = ["jessica", "the-grinch"];
const CommitMessage = `Automatic de-linting\n[atomist:auto-delint]`;

interface Analysis extends Details {
    project: GitProject;
    author: string;
    lintable: boolean;
    happy?: boolean;
    changed: boolean;
    status?: GitStatus;
    personWantsMyHelp: boolean;
    offered: boolean;
    pushed: boolean;
    error?: Error;
    problems?: Problem[];
    commit: { sha: string };
}

function skipThisCommitEntirely(commitMessage: string): boolean {
    if (commitMessage === CommitMessage) {
        // haha, I made this commit
        return true;
    }
    return false;
}

export function lintingIsWanted(override: boolean, author: string): boolean {
    if (PeopleWhoWantLintingOnTheirBranches.includes(author)) {
        return true;
    }
    return false;
}

export function shouldOfferToHelp(author: string): boolean {
    if (PeopleWhoDoNotWantMeToOfferToHelp.includes(author)) {
        return false;
    }
    return true;
}

@EventHandler("Runs ts tslint --fix on a given repository",
    GraphQL.subscriptionFromFile("graphql/subscription/pushToTsLinting"))
export class PushToTsLinting implements HandleEvent<graphql.PushToTsLinting.Subscription> {

    @Secret(Secrets.OrgToken)
    public githubToken: string;

    public handle(event: EventFired<graphql.PushToTsLinting.Subscription>,
                  ctx: HandlerContext, params: this): Promise<HandlerResult> {
        const push = event.data.Push[0];

        const details: Details = {
            ...push,
            commit: push.after,
            specificallyRequested: false,
        } as Details;

        if (skipThisCommitEntirely(push.after.message)) {
            return ctx.messageClient.addressChannels(`Skipping entirely: ${linkToCommit(WhereToLink.fromPush(push))}`, adminChannelId);
        }

        const author: string = _.get(push, "after.author.person.chatId.screenName") ||
            _.get(push, "after.author.login") || "unknown";

        initialReportEvent(ctx, push, author);

        return handleTsLint(ctx, { token: params.githubToken }, details, author);

    }
}

@CommandHandler("Run tslint on a branch and make a commit", "lint for me")
export class PleaseLint implements HandleCommand<BranchInRepoParameters> {

    public freshParametersInstance() {
        return new BranchInRepoParameters();
    }

    public handle(context: HandlerContext, params: BranchInRepoParameters): Promise<HandlerResult> {
        const detail: Details = {
            branch: params.branch || "master",
            repo: { owner: params.owner, name: params.repo },
            specificallyRequested: true,
        };

        initialReportCommand(context, detail, params.screenName);

        return handleTsLint(context, params.credentials, detail, params.screenName);
    }

}

interface Details {
    branch: string;
    repo: {
        owner: string,
        name: string,
    };
    specificallyRequested: boolean;
}

function handleTsLint(ctx: HandlerContext, creds: ProjectOperationCredentials,
                      details: Details, author: string) {

    const personCares: boolean = lintingIsWanted(false, author);

    // end debugging

    const startAnalysis: Partial<Analysis> = {
        ...details,
        personWantsMyHelp: personCares,
        author,
    };

    const projectPromise: Promise<GitProject> = GitCommandGitProject.cloned(creds,
        new GitHubRepoRef(details.repo.owner, details.repo.name, details.branch));
    const isItLintable: Promise<Partial<Analysis>> = projectPromise.then(project => {
        if (project.fileExistsSync("tslint.json")) {
            return { ...startAnalysis, project, lintable: true };
        } else {
            return { ...startAnalysis, project, lintable: false };
        }
    });
    const populateTheSha: Promise<Partial<Analysis>> = isItLintable
        .then(analysis => analysis.project.gitStatus()
            .then(gitStatus => ({ ...analysis, commit: { sha: gitStatus.sha } })));
    const soLintIt: Promise<Partial<Analysis>> = populateTheSha.then(soFar => {
        if (soFar.lintable) {
            return runTslint(soFar.project)
                .then(lintStatus => {
                    if (lintStatus.success) {
                        return { ...soFar, happy: true };
                    } else {
                        return {
                            ...soFar,
                            happy: false,
                            problems: findComplaints(WhereToLink.fromDetails(details, soFar.commit.sha),
                                soFar.project.baseDir, lintStatus.errorOutput),
                        };
                    }
                });
        } else {
            return Promise.resolve(soFar);
        }
    });
    const didItChange: Promise<Partial<Analysis>> = soLintIt.then(soFar =>
        soFar.project.gitStatus()
            .then(status => {
                return ({ ...soFar, changed: !status.isClean, status });
            }));
    const letsPushIt: Promise<Analysis> = didItChange.then(soFar => {
        if (soFar.changed && soFar.happy) {
            if (soFar.personWantsMyHelp || soFar.specificallyRequested) {
                return soFar.project.commit(CommitMessage)
                    .then(() => soFar.project.push())
                    .then(() => ({ ...soFar, pushed: true, offered: false } as Analysis))
                    .catch(error => ({ ...soFar, pushed: false, offered: false, error } as Analysis));
            } else {
                if (shouldOfferToHelp(soFar.author)) {
                    return offerToHelp(ctx, soFar as Analysis)
                        .then(() => ({ ...soFar, pushed: false, offered: true } as Analysis));
                }
            }
        } else {
            return Promise.resolve({ ...soFar, pushed: false, offered: false } as Analysis);
        }
    });

    return letsPushIt
        .then(analysis => sendNotification(analysis.project, ctx, details, analysis))
        .catch(error => reportError(ctx, details, error));
}

function sendNotification(project: Project, ctx: HandlerContext, details: Details,
                          analysis: Analysis): Promise<any> {

    const whoami = `${configuration.name}:${configuration.version}`;

    function reportToMe(notification: string) {
        const slackMessage: slack.SlackMessage = {
            text: `Linted for ${analysis.author} on ${linkToCommit(WhereToLink.fromDetails(details, analysis.commit.sha))}, branch ${details.branch}`,
            attachments: [
                {
                    fallback: "did stuff",
                    text: notification,
                    footer: whoami,
                }
                , formatAnalysis(ctx, analysis)],
        };

        return ctx.messageClient.addressChannels(
            slackMessage,
            adminChannelId, { id: ctx.correlationId, ts: 2 });
    }

    if (!analysis.lintable) {
        logger.info("Nothing to do on project " + details.repo + ", not lintable");
        return reportToMe("nothing");
    }
    if (analysis.pushed && analysis.happy) {
        // we are so useful
        return ctx.messageClient.addressUsers(
            `Hey, I fixed some linting errors on your commit ${linkToCommit(WhereToLink.fromDetails(details, analysis.commit.sha))}. Please pull.`,
            analysis.author, identifyMessage(analysis))
            .then(() => reportToMe("I told them they should pull"));
    }
    if (analysis.happy && analysis.changed && !analysis.personWantsMyHelp && !analysis.offered) {
        return reportToMe(`I could have fixed it, but didn't because ${analysis.author} didn't want me to`);
    }
    if (analysis.offered) {
        return reportToMe(`I offered to help ${analysis.author}`);
    }
    if (!analysis.pushed && !analysis.happy) {

        return problemsToAttachments(project, analysis, WhereToLink.fromDetails(details, analysis.commit.sha), analysis.problems)
            .then(attachments =>
                ctx.messageClient.addressUsers({
                    text:
                    `Bad news: there are ${analysis.problems.length} tricky linting errors on ${
                    linkToCommit(WhereToLink.fromDetails(details, analysis.commit.sha),
                        "your commit")} to ${details.repo.name}#${details.branch}.`,
                    attachments,
                },
                    analysis.author, identifyMessage(analysis)))
            .then(() => reportToMe("I told them to fix it themselves"));
    }
    return reportToMe("I did nothing");
}

function identifyMessage(info: Details): MessageOptions {
    return { id: `yo-tslint-${info.repo.owner}-${info.repo.name}-${info.branch}`, ttl: 90 };
}

function offerToHelp(context: HandlerContext, analysis: Analysis): Promise<void> {

    const slackMessage: slack.SlackMessage = {
        text: `There are linting errors on your ${
        linkToCommit(WhereToLink.fromDetails(analysis, analysis.commit.sha))}. Would you like me to fix them for you?`,
        attachments: [{
            fallback: "buttons", actions: [
                buttonForCommand({ text: "Fix it" },
                    "PleaseLint",
                    {
                        branch: analysis.branch,
                        repo: analysis.repo.name,
                        owner: analysis.repo.owner,
                    }),
                buttonForCommand({ text: "Never ask again" }, "StopBotheringMe"),
            ],
        }],
    };
    logger.info("I would offer to help if I knew how ...");
    return context.messageClient.addressUsers(slackMessage, analysis.author, identifyMessage(analysis));
}

function formatAnalysis(ctx: HandlerContext, analysis: Analysis): slack.Attachment {
    const color = analysis.changed ?
        (analysis.pushed ? "#22a703" :
            "#aa1155") :
        "#444444";

    return {
        color,
        fallback: "analysis goes here",
        text: analysis.problems ? analysis.problems.map(formatProblem).join("\n") : "No problems",
        fields: fields(["author", "personWantsMyHelp", "specificallyRequested",
            "lintable", "happy", "changed", "pushed"],
            ["status.raw", "error"], analysis),
        footer: ctx.correlationId,
    };
}

function fields(shortOnes: string[], longOnes: string[], source: object) {
    const shorts = shortOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: true }));
    const longs = longOnes.map(f => ({ title: f, value: stringify(_.get(source, f, "undefined")), short: false }));

    return shorts.concat(longs);
}

function initialReportEvent(ctx: HandlerContext, push: graphql.PushToTsLinting.Push, author: string) {
    const whoami = `${configuration.name}:${configuration.version}`;

    ctx.messageClient.addressChannels(
        `${whoami}: ${author} made ${linkToCommit(WhereToLink.fromPush(push))}, message \`${push.after.message}\`. Linting`, adminChannelId,
        { id: ctx.correlationId, ts: 1 });
}

function initialReportCommand(ctx: HandlerContext, details: Details, author: string) {
    const whoami = `${configuration.name}:${configuration.version}`;

    return ctx.messageClient.addressChannels(
        `${whoami}: ${author} requested linting on ${linkToBranch(details)}. Linting`, adminChannelId,
        { id: ctx.correlationId, ts: 1 });
}

async function reportError(ctx: HandlerContext, details: Details, error: Error) {
    await ctx.messageClient.addressChannels(`Uncaught error while linting ${linkToBranch(details)}: ` + error, adminChannelId);
    return failure(error);
}

class WhereToLink {

    public static fromPush(push: graphql.PushToTsLinting.Push): WhereToLink {
        return new WhereToLink(push.repo.owner, push.repo.name, push.branch, push.after.sha);
    }

    public static fromDetails(details: Details, sha: string): WhereToLink {
        return new WhereToLink(details.repo.owner, details.repo.name, details.branch, sha);
    }

    constructor(public readonly owner: string,
                public readonly repo: string,
                public readonly branch: string,
                public readonly sha: string) {
    }
}

function linkToCommit(where: WhereToLink, text: string = `commit on ${where.repo}#${where.branch}`) {
    return slack.url(
        `https://github.com/${where.owner}/${where.repo}/commit/${where.sha}`,
        text);
}

function linkToBranch(details: Details) {
    return slack.url(
        `https://github.com/${details.repo.owner}/${details.repo.name}/tree/${details.branch}`,
        `${details.repo.name}#${details.branch}`);
}

function urlToLine(push: WhereToLink, location: Location) {
    return `https://github.com/${push.owner}/${push.repo}/blob/${push.sha}/${location.path}#L${location.lineFrom1}`;
}

function linkToLine(push: WhereToLink, location: Location) {
    return slack.url(
        urlToLine(push, location),
        location.description);
}

interface Problem {
    text: string;
    location?: Location;
    recognizedError?: RecognizedError;
}

function formatProblem(problem: Problem): string {
    return problem.recognizedError ? slack.bold(problem.recognizedError.name) + "" : problem.text;
}

function locate(baseDir: string, tsError: RuleFailure): Location | undefined {

    const lineFrom1 = tsError.startPosition.line + 1;
    const columnFrom1 = tsError.startPosition.character + 1;
    const updatedPath = path.relative(baseDir, tsError.name);
    return {
        path: updatedPath,
        lineFrom1,
        columnFrom1,
        description: `${updatedPath} [${lineFrom1}, ${columnFrom1}]`,
    };
}

function problemToText(push: WhereToLink, baseDir: string, tsError: RuleFailure): string {
    const location = locate(baseDir, tsError);
    return `${tsError.ruleSeverity}: (${tsError.ruleSeverity}) ${linkToLine(push, location)}: ${tsError.failure}`;
}

function problemsToAttachments(project: Project, details: Details, push: WhereToLink, problems?: Problem[]): Promise<slack.Attachment[]> {
    if (!problems) {
        return Promise.resolve([]);
    }
    return Promise.all(problems.map(p => problemToAttachment(project, details, push, p)));
}

function problemToAttachment(project: Project, details: Details, push: WhereToLink, problem: Problem): Promise<slack.Attachment> {
    const output: slack.Attachment = { fallback: "problem", mrkdwn_in: ["text"] };

    if (problem.location) {
        output.author_name = problem.location.description;
        output.author_link = urlToLine(push, problem.location);
    }
    if (problem.recognizedError) {
        output.title = problem.recognizedError.name + ": " + problem.recognizedError.description;
        output.color = problem.recognizedError.color;
    } else {
        output.text = problem.text;
    }

    if (problem.recognizedError && problem.location && problem.recognizedError.usefulToShowLine) {
        return getFileContentFromProject(project, problem.location.path).then(content => {
            const lineContent = getLine(content, problem.location.lineFrom1);
            const fixInfo = problem.recognizedError.fix(details, problem.location, lineContent);
            output.text = "`" + lineContent.trim() + "`" + "\n" + fixInfo.text;
            output.actions = fixInfo.actions.concat([overrideButton(details, problem, lineContent)]);
            return output;
        });
    } else {
        logger.info("Recognized error? " + !!problem.recognizedError + " problem.location? " + !!problem.location);
        return Promise.resolve(output);
    }
}

function overrideButton(details: Details, problem: Problem, offendingLine: string): Action {
    const parameters = new InsertAboveLineParameters();
    parameters.targets.owner = details.repo.owner;
    parameters.targets.repo = details.repo.name;
    parameters.message = "Override lint rule";
    parameters.insert = `// tslint:disable-next-line:${problem.recognizedError.name}`;
    parameters.previousContent = offendingLine;
    parameters.lineFrom1 = problem.location.lineFrom1;
    parameters.path = problem.location.path;
    parameters.targets.branch = details.branch;
    // I don't know whether this is necessary but I want it to work and I don't want to fiddle much
    return buttonForCommand({ text: "Override" }, "InsertAboveLine",
        {
            "targets.owner": parameters.targets.owner,
            "targets.repo": parameters.targets.repo,
            "targets.branch": parameters.targets.branch,
            "message": parameters.message,
            "insert": parameters.insert,
            "previousContent": parameters.previousContent,
            "lineFrom1": parameters.lineFrom1,
            "path": parameters.path,
        });
}

function getLine(content: string, lineFrom1: number) {
    const lines = content.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to retrieve line ${lineFrom1}`;
    }
    return lines[lineFrom1 - 1];
}

function findComplaints(push: WhereToLink, baseDir: string, tslintOutput: RuleFailure[]): Problem[] {
    if (!tslintOutput) {
        return undefined;
    }
    return tslintOutput
        .map((p: RuleFailure) => ({
            text: problemToText(push, baseDir, p),
            location: locate(baseDir, p),
            recognizedError: recognizeError(p),
        }));
}

export function runTslint(project: GitProject) {

    // const configurationFilename = project.baseDir + "/tsconfig.json";
    // const configuration = Configuration.findConfiguration(configurationFilename).results;
    // const options: ILinterOptions = {
    //     fix: true,
    //     formatter: "json",
    // };
    // return doWithFiles(project, "**/*.ts", f => f.getContent().then(fileContents => {
    //     if (!f.path.startsWith("node_modules") && !f.path.startsWith("build")) {
    //         const linter = new Linter(options);
    //         linter.lint(project.baseDir + "/" + f.path, fileContents, configuration);
    //         const result = linter.getResult();
    //         result.failures.forEach(fail => fail.getRawLines())
    //     }
    // })).then();

    const options: Options = {
        exclude: ["node_modules/**", "build/**"],
        fix: true,
        project: project.baseDir,
        format: "json",
        outputAbsolutePaths: false,
    };
    const errors: string[] = [];
    const logs: string[] = [];
    const loggo = {
        log(str) {
            logger.debug("Log: " + str);
            logs.push(str);
        },
        error(str) {
            logger.debug("err: " + str);
            errors.push(str);
        },
    };
    return run(options, loggo).then(status => {
        logger.info("returned from run");
        // I don't know why Status.Ok NPEs in mocha at the command line. It works in IntelliJ
        return { success: status === 0 /* Status.Ok */, errorOutput: JSON.parse(logs.join("\n")) as RuleFailure[] };
    });
}
