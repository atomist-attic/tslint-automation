import { logger } from "@atomist/automation-client";
import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import * as cfenv from "cfenv";
import { DeployAfterSuccessfulBuild } from "./handlers/DeploySelf";
import { HelloWorld } from "./handlers/HelloWorld";
import { insertAboveLineCommand } from "./handlers/InsertAboveLine";
import { PleaseLint, PushToTsLinting } from "./handlers/PushToTsLinting";
import { StopBotheringMe } from "./handlers/SelfConfigurate";
import { UpdateMessageOnBuild } from "./handlers/UpdateMessageOnBuild";
import { replaceLineCommand } from "./handlers/ReplaceLine";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const appEnv = cfenv.getAppEnv();
const githubCredsFromCloudFoundry = appEnv.getServiceCreds("github-token");
let token = process.env.GITHUB_TOKEN;
if (githubCredsFromCloudFoundry) {
    logger.info("Using github token from Cloud Foundry environment");
    token = githubCredsFromCloudFoundry.token;
}

export const adminCreds = { token };

export let gitInfo = { sha: "unknown", branch: "unknown", repository: "unknown" };
try {
    gitInfo = require(appRoot.path + "/git-info.json");
    logger.info("Found git-info.json!");
} catch (e) {
    logger.warn("Did not locate git-info.json");
}

const teamIds = ["T29E48P34"];
export const adminSlackUserNames = ["jessica", "jessitron"];
export const adminChannelId = "C8JUBSYKD";

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    teamIds,
    commands: [
        HelloWorld,
        StopBotheringMe,
        PleaseLint,
        () => insertAboveLineCommand(),
        () => replaceLineCommand(),
    ],
    events: [
        () => new PushToTsLinting(),
        DeployAfterSuccessfulBuild,
        UpdateMessageOnBuild,
    ],
    token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
};
