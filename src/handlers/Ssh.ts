import { HandleCommand, HandlerContext, logger, MappedParameter, MappedParameters, Parameter, Secret, Secrets, } from "@atomist/automation-client";
import axios from "axios";
import { Parameters } from "@atomist/automation-client/decorators";
import { commandHandlerFrom, OnCommand } from "@atomist/automation-client/onCommand";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as child_process from "child_process";
import { whereAmIRunning } from "../util/provenance";
import { adminCreds, adminGitHubUser } from "../credentials";


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
export class SshParameters {
    @Parameter()
    public cmd: string;

    @MappedParameter(MappedParameters.SlackUser)
    public slackUserId: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public slackChannelId: string;

    @Secret(Secrets.UserToken)
    public authorization: string;
}

const runAndReport: OnCommand<SshParameters> = (context: HandlerContext, params: SshParameters) => {
    if (params.authorization === adminCreds.token) {
        return context.messageClient.respond("Nope. Got the same token this automation runs with.")
    }

    return gitHubLogin(params.authorization).then(ghLogin => {
        if (ghLogin !== adminGitHubUser) {
            return context.messageClient.respond("Nope. admins only")
        }
        return runCommand(params.cmd)
            .then(deployCmdOutput => reportCommandOutput(deployCmdOutput)
                .then(message =>
                    context.messageClient.respond(message)))
    });
};

export function sshCommand(): HandleCommand<SshParameters> {
    return commandHandlerFrom(runAndReport, SshParameters,
        "DeploySelfCommand", "update the docker image for the container running this automation",
        "deploy tslint-automation");
}

const userUrl = "https://api.github.com/user";

function gitHubLogin(token: string): Promise<string> {
    return axios.get(userUrl, {
        headers:
            { Authorization: "token " + token },
    })
        .then(userResponse => userResponse.data.login,
            error => {
                logger.error("Unable to retrieve github user");
                logger.error("URL: " + userUrl);
                logger.error(error.message);
                process.exit(1);
            });
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
    if (commandOutput.stdout && commandOutput.stdout.length > 0) {
        attachments.push({
            fallback: "stdout",
            color: "#149410",
            text: commandOutput.stdout,
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

function runCommand(dockerImageTag: string): Promise<CommandOutput> {
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
