import { logger } from "@atomist/automation-client";
import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import * as cfenv from "cfenv";
import { HelloWorld } from "./handlers/HelloWorld";
import { PushToTsLinting } from "./handlers/PushToTsLinting";
import { execufy } from "./util/execufy";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const appEnv = cfenv.getAppEnv();
const githubCredsFromCloudFoundry = appEnv.getServiceCreds("github-token");
let token = process.env.GITHUB_TOKEN;
if (githubCredsFromCloudFoundry) {
    logger.info("Using github token from Cloud Foundry environment");
    token = githubCredsFromCloudFoundry.token;
}

execufy("pwd", "failure")
    .then(cwd => logger.info("Running in: " + cwd));

let gitInfo = { sha: "unknown", branch: "unknown", repository: "unknown"};
try {
    gitInfo = require ("./git-info.json")
} catch (e)
{
    logger.warn("Did not locate git-info.json");
}


const teamIds = ["T29E48P34"];

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    teamIds,
    commands: [
        HelloWorld,
    ],
    events: [
        () => new PushToTsLinting(),
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
