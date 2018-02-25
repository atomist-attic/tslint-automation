import { logger } from "@atomist/automation-client";
import { LoggingConfig } from "@atomist/automation-client/internal/util/logger";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import * as stringify from "json-stringify-safe";
import "mocha";
import * as assert from "power-assert";
import { runTslint } from "../src/handlers/PushToTsLinting";

LoggingConfig.format = "cli";
(logger as any).level = process.env.LOG_LEVEL || "info";

const GitHubCredentials = { token: process.env.GITHUB_TOKEN };

describe("can we lint the thing?", () => {

    it("can lint a thing", done => {
        GitCommandGitProject.cloned(GitHubCredentials, new GitHubRepoRef("atomist", "upgrade-client-automation"))
            .then(project => runTslint(project))
            .then(result => {
                assert(!result.success, stringify(result));
            })
            .then(() => done(), done);
    }).timeout(240000);
});
