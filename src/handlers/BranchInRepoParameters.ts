/**
 * Get target from channel mapping
 */

import { MappedParameter, MappedParameters, Parameter } from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { GitBranchRegExp } from "@atomist/automation-client/operations/common/params/gitHubPatterns";
import { GitHubTargetsParams } from "@atomist/automation-client/operations/common/params/GitHubTargetsParams";

@Parameters()
export class BranchInRepoParameters extends GitHubTargetsParams {

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @Parameter({ description: "Branch. Defaults to 'master'", ...GitBranchRegExp, required: false })
    public branch: string = "master";

    get sha() {
        return this.branch;
    }

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

}
