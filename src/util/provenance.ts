import { configuration } from "../atomist.config";
import { logger } from "@atomist/automation-client";
import * as fs from "fs";

const childProcess = require("child_process");

function execufy(cmd: string, errorResult: string): Promise<string> {
    return new Promise((resolve, reject) => {
        childProcess.exec(cmd, (error, stdout: string, stderr: string) => {
            if (error) {
                console.log(`stderr from ${cmd}: ${stderr}`);
                resolve(errorResult);
            } else {
                resolve(stdout);
            }
        });
    });
}

function describeLocal(): Promise<string> {
    return Promise.all(
        [execufy("git rev-parse HEAD", "(no sha)"),
            execufy("git diff-index --quiet HEAD --", " (dirty)"),
            execufy("hostname", "an unknown host")]).then(values => {
        const [sha, dirty, host] = values;
        return Promise.resolve(
            `this message brought to you by ${configuration.name}:${configuration.version} running on ${host} at ${sha}${dirty}`);
    });
}

interface CloudFoundryVcapApplication {
    space_id: string;
    instance_id: string;
    start: string;
}


function describeCloudFoundry(): Promise<string> {

    const gitInfo = require("./git-info.json");

    const vcap: CloudFoundryVcapApplication = JSON.parse(process.env.VCAP_APPLICATION);
    logger.info("VCAP_APPLICATION = " + JSON.stringify(vcap, null, 2));
    return Promise.resolve(
        `from: ${configuration.name}:${configuration.version} running in space ${
            vcap.space_id}, instance ${vcap.instance_id}
            Git SHA: ${gitInfo.sha}`);
}

export function whereAmIRunning(): Promise<string> {
    if (process.env.VCAP_APPLICATION) {
        return describeCloudFoundry();
    } else {
        return describeLocal();
    }
}
