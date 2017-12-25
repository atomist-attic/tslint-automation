import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import { HelloWorld } from "./handlers/HelloWorld";
import { PushToTsLinting } from "./handlers/PushToTsLinting";
import * as cfenv from "cfenv";
import * as _ from "lodash";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const appEnv = cfenv.getAppEnv();

const token = _.get(appEnv.getServiceCreds("github-token"),
    "github.token",
    process.env.GITHUB_TOKEN);
const teamIds = process.env.TEAM_ID;

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
