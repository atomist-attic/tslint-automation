import {
    EventFired, EventHandler, HandleCommand, HandleEvent, HandlerContext, HandlerResult, logger, Parameter,
    Success,
} from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { subscriptionFromFile } from "@atomist/automation-client/graph/graphQL";
import { commandHandlerFrom, OnCommand } from "@atomist/automation-client/onCommand";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as child_process from "child_process";
import { adminSlackUserNames } from "../atomist.config";
import * as graphql from "../typings/types";
import { whereAmIRunning } from "../util/provenance";

const MyGitHubOrganization = "atomist";
const MyGitHubRepository = "tslint-automation";

@EventHandler("Deploy myself; update the image in k8s when a build succeeds",
    subscriptionFromFile("graphql/successfulBuild"))
export class DeployAfterSuccessfulBuild implements HandleEvent<graphql.SuccessfulBuild.Subscription> {

    public handle(event: EventFired<graphql.SuccessfulBuild.Subscription>,
                  context: HandlerContext): Promise<HandlerResult> {

        const build = event.data.Build[0];

        if (build.repo.name !== MyGitHubRepository ||
            build.repo.owner !== MyGitHubOrganization ||
            build.push.branch !== "master") {
            // my dm is gonna get even spammier
            return context.messageClient.addressUsers(
                `There was ${slack.url(build.buildUrl, "a successful build")}, but it wasn't mine`, adminSlackUserNames)
                .then(() => Promise.resolve(Success));
        }
        return context.messageClient.addressUsers("I would now like to deploy tag " + build.name, adminSlackUserNames)
            .then(() => Success);
    }
}

function runCommandLine(cmd: string): Promise<{ stdout: string, stderr: string, error?: Error }> {
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout: string, stderr: string) => {
            if (error) {
                resolve({ stdout, stderr, error });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

@Parameters()
export class DeploySelfParameters {
    @Parameter()
    public dockerImageTag: string;
}

const deployAndReport: OnCommand<DeploySelfParameters> = (context: HandlerContext, params: DeploySelfParameters) => {
    return deploySelf(params.dockerImageTag)
        .then(deployCmdOutput => reportCommandOutput(deployCmdOutput)
            .then(message =>
                context.messageClient.respond(message)));
};

export function deployCommand(): HandleCommand<DeploySelfParameters> {
    return commandHandlerFrom(deployAndReport, DeploySelfParameters,
        "DeploySelfCommand", "update the docker image for the container running this automation",
        "deploy tslint-automation");
}

async function reportCommandOutput(commandOutput: CommandOutput): Promise<slack.SlackMessage> {

    const attachments: slack.Attachment[] = [{ fallback: "provenance", footer: await whereAmIRunning() }];
    if (commandOutput.stderr && commandOutput.stderr.length > 0) {
        attachments.push({
            fallback: "stderr",
            color: "#a00410",
            text: commandOutput.stderr,
        });
    }
    if (commandOutput.stderr && commandOutput.stderr.length > 0) {
        attachments.push({
            fallback: "stderr",
            color: "#149410",
            text: commandOutput.stderr,
        });
    }
    const message: slack.SlackMessage = {
        text: "Ran: `" + commandOutput.cmd + "`",
        attachments,
    };
    return message;
}

interface CommandOutput {
    cmd: string;
    stdout: string;
    stderr: string;
}

function deploySelf(dockerImageTag: string): Promise<CommandOutput> {
    const cmd = "kubectl set image deployment/atomist-community-linting atomist-community-linting=jessitron/linting-automation:" + dockerImageTag;
    logger.info("Running: " + cmd);
    return runCommandLine(cmd)
        .then(result => {
            const { stdout, stderr, error } = result;
            logger.info(stdout);
            if (stderr && stderr.length > 0) {
                logger.error(stderr);
            }
            if (error) {
                logger.error(error.toString());
            }
            return { cmd, stdout, stderr };
        });

}
