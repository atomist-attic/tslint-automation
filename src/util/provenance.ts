import { logger } from "@atomist/automation-client";
import { configuration, gitInfo } from "../atomist.config";
import { execufy } from "./execufy" ;

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
