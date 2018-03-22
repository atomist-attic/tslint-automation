import { logger } from "@atomist/automation-client";
import * as appRoot from "app-root-path";

export const adminSlackUserNames = ["jessica", "jessitron"];
export const adminChannelId = "C8P0Z3YTE";
export const adminGitHubUser = "jessitron";

export let gitInfo = { sha: "unknown", branch: "unknown", repository: "unknown" };
try {
    gitInfo = require(appRoot.path + "/git-info.json");
    logger.info("Found git-info.json!");
} catch (e) {
    logger.warn("Did not locate git-info.json");
}

export const packageJson = require(`${appRoot}/package.json`);
