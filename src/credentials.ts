/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
