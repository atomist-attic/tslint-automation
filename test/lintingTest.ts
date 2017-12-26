import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import * as stringify from "json-stringify-safe";
import "mocha";
import * as assert from "power-assert";
import { runTslint } from "../src/handlers/PushToTsLinting";

const GitHubCredentials = { token: process.env.GITHUB_TOKEN };

describe.skip("can we lint the thing?", () => {

    it("can lint a thing", done => {
        GitCommandGitProject.cloned(GitHubCredentials, new GitHubRepoRef("atomist", "automation-client-ts"))
            .then(project => runTslint(project.baseDir))
            .then(result => {
                assert(result.success);
                console.log(stringify(result));
            })
            .then(() => done(), done);
    }).timeout(100000);
});
