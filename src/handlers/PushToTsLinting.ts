import {
    CommandHandler,
    EventFired,
    HandleCommand,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secrets,
} from "@atomist/automation-client";
import { EventHandler, Parameters, Secret } from "@atomist/automation-client/decorators";
import * as GraphQL from "@atomist/automation-client/graph/graphQL";
import { logger } from "@atomist/automation-client/internal/util/logger";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { GitStatus } from "@atomist/automation-client/project/git/gitStatus";
import * as slack from "@atomist/slack-messages/SlackMessages";
import { exec } from "child-process-promise";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import * as path from "path";
import { Options, run } from "tslint/lib/runner";
import { configuration } from "../atomist.config";
import * as graphql from "../typings/types";
import { getFileContentFromProject } from "../util/getFileContent";
import { ProjectOperationCredentials } from "@atomist/automation-client/operations/common/ProjectOperationCredentials";
import { GitHubTargetsParams } from "@atomist/automation-client/operations/common/params/GitHubTargetsParams";
import { Project } from "@atomist/automation-client/project/Project";
import { GitBranchRegExp } from "@atomist/automation-client/operations/common/params/gitHubPatterns";

export const PeopleWhoWantLintingOnTheirBranches = ["cd", "jessica", "jessitron", "clay"];
export const PeopleWhoDoNotWantMeToOfferToHelp = ["jessica", "jessica", "jessica", "the-grinch"];
const me = ["jessica", "jessitron"];
const CommitMessage = `Automatic de-linting\n[atomist:auto-delint]`;

interface Analysis {
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
    commit: { sha: string }
}

function stringifyAnalysis(a: Analysis): string {
    return `personCares? ${a.personWantsMyHelp}
lintable? ${a.lintable}
happy?    ${a.happy}
changed?  ${a.changed}
pushed?   ${a.pushed}
status:   ${stringify(a.status)}
error: ${a.error}`;
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
        } as Details;


        if (skipThisCommitEntirely(push.after.message)) {
            return ctx.messageClient.addressUsers(`Skipping entirely: ${linkToCommit(WhereToLink.fromPush(push))}`, me);
        }

        const author: string = _.get(push, "after.author.person.chatId.screenName") ||
            _.get(push, "after.author.login") || "unknown";

        initialReportEvent(ctx, push, author);


        return handleTsLint(ctx, { token: params.githubToken }, details, author)

    }
}

/**
 * Get target from channel mapping
 */
@Parameters()
export class BranchInRepoParameters extends GitHubTargetsParams {

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @Parameter({ description: "Branch. Defaults to 'master'", ...GitBranchRegExp, required: false })
    public branch: string;

    public sha = {
        get() {
            return this.branch;
        },
    }

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

}

@CommandHandler("Run tslint on a branch and make a commit", "lint for me")
export class PleaseLint implements HandleCommand<BranchInRepoParameters> {

    public freshParametersInstance() {
        return new BranchInRepoParameters()
    }

    public handle(context: HandlerContext, params: BranchInRepoParameters): Promise<HandlerResult> {
        const detail: Details = {
            branch: params.branch || "master",
            repo: { owner: params.owner, name: params.repo },
        };

        initialReportCommand(context, detail, params.screenName);

        return handleTsLint(context, params.credentials, detail, params.screenName);
    }

}

interface Details {
    branch: string,
    repo: {
        owner: string,
        name: string,
    }
}

function handleTsLint(ctx: HandlerContext, creds: ProjectOperationCredentials,
                      details: Details, author: string) {


    const personCares: boolean = lintingIsWanted(false, author);

    // end debugging

    const startAnalysis: Partial<Analysis> = { personWantsMyHelp: personCares, author };

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
            return runTslint(soFar.project.baseDir)
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
            if (soFar.personWantsMyHelp) {
                return soFar.project.commit(CommitMessage)
                    .then(() => soFar.project.push())
                    .then(() => ({ ...soFar, pushed: true, offered: false } as Analysis))
                    .catch(error => ({ ...soFar, pushed: false, offered: false, error } as Analysis));
            } else {
                if (shouldOfferToHelp(soFar.author)) {
                    return offerToHelp(ctx).then(() => ({ ...soFar, pushed: false, offered: true } as Analysis));
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

function sendNotification(project: Project, ctx: HandlerContext, push: Details,
                          analysis: Analysis): Promise<any> {

    const whoami = `${configuration.name}:${configuration.version}`;

    function reportToMe(notification: string) {
        const details: slack.SlackMessage = {
            text: `Linted for ${analysis.author} on ${linkToCommit(WhereToLink.fromDetails(push, analysis.commit.sha))}, branch ${push.branch}`,
            attachments: [
                {
                    fallback: "did stuff",
                    text: notification,
                    footer: whoami,
                }
                , formatAnalysis(ctx, analysis)],
        };

        return ctx.messageClient.addressUsers(
            details,
            me, { id: ctx.correlationId, ts: 2 });
    }

    if (!analysis.lintable) {
        logger.info("Nothing to do on project " + push.repo + ", not lintable");
        return reportToMe("nothing");
    }
    if (analysis.pushed && analysis.happy) {
        // we are so useful
        return ctx.messageClient.addressUsers(
            `Hey, I fixed some linting errors on your commit ${linkToCommit(WhereToLink.fromDetails(push, analysis.commit.sha))}. Please pull.`,
            analysis.author)
            .then(() => reportToMe("I told them they should pull"));
    }
    if (analysis.happy && analysis.changed && !analysis.personWantsMyHelp && !analysis.offered) {
        return reportToMe(`I could have fixed it, but didn't because ${analysis.author} didn't want me to`);
    }
    if (analysis.offered) {
        return reportToMe(`I offered to help ${analysis.author}`);
    }
    if (!analysis.pushed && !analysis.happy) {

        return problemsToAttachments(project, WhereToLink.fromDetails(push, analysis.commit.sha), analysis.problems)
            .then(attachments =>
                ctx.messageClient.addressUsers({
                        text:
                            `Bad news: there are some tricky linting errors on ${
                                linkToCommit(WhereToLink.fromDetails(push, analysis.commit.sha), "your commit")} to ${push.repo.name}#${push.branch}.`,
                        attachments,
                    },
                    analysis.author))
            .then(() => reportToMe("I told them to fix it themselves"));
    }
// OK I'm not handling the other cases. Tell me about it.
    return reportToMe("I did nothing");
}

function offerToHelp(context: HandlerContext): Promise<void> {
    logger.info("I would offer to help if I knew how ...");
    return Promise.resolve();
}

function formatAnalysis(ctx: HandlerContext, analysis: Analysis): slack.Attachment {
    return {
        fallback: "analysis goes here",
        text: analysis.problems ? analysis.problems.map(formatProblem).join("\n") : "No problems",
        fields: fields(["author", "personWantsMyHelp", "lintable", "happy", "changed", "pushed"],
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

    ctx.messageClient.addressUsers(
        `${whoami}: ${author} made ${linkToCommit(WhereToLink.fromPush(push))}, message \`${push.after.message}\`. Linting`, me,
        { id: ctx.correlationId, ts: 1 });
}

function initialReportCommand(ctx: HandlerContext, details: Details, author: string) {
    const whoami = `${configuration.name}:${configuration.version}`;

    return ctx.messageClient.addressUsers(
        `${whoami}: ${author} requested linting on ${linkToBranch(details)}. Linting`, me,
        { id: ctx.correlationId, ts: 1 });
}

function reportError(ctx: HandlerContext, details: Details, error: Error) {
    ctx.messageClient.addressUsers(`Uncaught error while linting ${linkToBranch(details)}: ` + error, me);
}

class WhereToLink {
    constructor(public readonly owner: string,
                public readonly repo: string,
                public readonly branch: string,
                public readonly sha: string) {
    }

    public static fromPush(push: graphql.PushToTsLinting.Push): WhereToLink {
        return new WhereToLink(push.repo.owner, push.repo.name, push.branch, push.after.sha)
    }

    public static fromDetails(details: Details, sha: string): WhereToLink {
        return new WhereToLink(details.repo.owner, details.repo.name, details.branch, sha)
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
        `${details.repo.name}#${details.branch}`)
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

interface Location {
    readonly path: string;
    readonly lineFrom1: number;
    readonly columnFrom1: number;
    readonly description: string;
    readonly formerDescription: string;
}

function locate(baseDir: string, tsError: string): Location | undefined {
    const pathAndLine = /([^\s]+)\[(\d+), (\d+)\]/;
    const match = tsError.match(pathAndLine);
    if (!match) {
        return undefined;
    }
    const formerDescription = match[0];
    const filePath = match[1];
    const lineFrom1 = +match[2];
    const columnFrom1 = +match[3];
    const updatedPath = path.relative(baseDir, filePath);
    const description = formerDescription.replace(baseDir, "");
    return {
        path: updatedPath,
        lineFrom1,
        columnFrom1,
        description,
        formerDescription: match[0],
    };
}

function addLinkToProblem(push: WhereToLink, baseDir: string, tsError: string): string {
    const location = locate(baseDir, tsError);
    if (!location) {
        return tsError;
    }
    return tsError.replace(location.formerDescription, linkToLine(push, location));
}

function problemsToAttachments(project: Project, push: WhereToLink, problems?: Problem[]): Promise<slack.Attachment[]> {
    if (!problems) {
        return Promise.resolve([]);
    }
    return Promise.all(problems.map(p => problemToAttachment(project, push, p)));
}

function problemToAttachment(project: Project, push: WhereToLink, problem: Problem): Promise<slack.Attachment> {
    const output: slack.Attachment = { fallback: "problem" };

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
            output.text = "`" + getLine(content, problem.location.lineFrom1) + "`";
            return output;
        });
    } else {
        logger.info("Recognized error? " + !!problem.recognizedError + " problem.location? " + !!problem.location);
        return Promise.resolve(output);
    }

}

function getLine(content: string, lineFrom1: number) {
    const lines = content.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to retrieve line ${lineFrom1}`;
    }
    return lines[lineFrom1 - 1];
}

class RecognizedError {

    private static defaultOptions = {
        color: "#888888",
        usefulToShowLine: true,
    };

    public color: string;
    public usefulToShowLine: boolean;

    constructor(public name: string,
                public description: string,
                opts?: { color?: string, usefulToShowLine?: boolean }) {
        const fullOpts = {
            ...RecognizedError.defaultOptions,
            ...opts,
        };
        this.color = fullOpts.color;
        this.usefulToShowLine = fullOpts.usefulToShowLine;
    }
}

class CommentFormatError extends RecognizedError {

    public static Name = "comment-format";

    public static recognize(name: string, description: string): CommentFormatError | null {
        if (name === this.Name) {
            return new CommentFormatError(description);
        }
        return null;
    }

    constructor(description: string) {
        super(CommentFormatError.Name, description,
            { color: "#d84010", usefulToShowLine: true });
    }
}

function recognizeError(tsError: string): RecognizedError {
    // ERROR: (comment-format) test/passContextToClone/editorTest.ts[986, 15]: comment must start with a space
    const pathAndLine = /ERROR: \(([a-z-]+)\).*: (.*)$/;
    const match = tsError.match(pathAndLine);
    if (!match) {
        return undefined;
    }

    const name = match[1];
    const description = match[2];

    return CommentFormatError.recognize(name, description) || new RecognizedError(name, description);
}

function findComplaints(push: WhereToLink, baseDir: string, tslintOutput: string): Problem[] {
    if (!tslintOutput) {
        return undefined;
    }
    return tslintOutput
        .split("\n")
        .filter(s => s.match(/^ERROR: /))
        .map(p => ({
            text: addLinkToProblem(push, baseDir, p),
            location: locate(baseDir, p),
            recognizedError: recognizeError(p),
        }));
}

export function runTslint(baseDir) {
    const options: Options = {
        exclude: ["node_modules/**", "build/**"],
        fix: true,
        project: baseDir,
    };
    const errors: string[] = [];
    const logs: string[] = [];
    const loggo = {
        log(str) {
            console.log("Log: " + str);
            logs.push(str);
        },
        error(str) {
            console.log("err: " + str);
            errors.push(str);
        },
    };
    return run(options, loggo).then(status => {
        console.log("returned from run");
        // I don't know why Status.Ok NPEs in mocha at the command line. It works in IntelliJ
        return { success: status === 0 /* Status.Ok */, errorOutput: logs.join("\n") };
    });
}
