import { commandHandlerFrom } from "@atomist/automation-client/onCommand";
import { HandleCommand, HandlerContext, Success } from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { PeopleWhoDoNotWantMeToOfferToHelp, PeopleWhoWantLintingOnTheirBranches } from "../PushToTsLinting";

@Parameters()
export class ReportConfigurationParams {

}

async function reportConfiguration(ctx: HandlerContext, params: ReportConfigurationParams): Promise<any> {
    const text = "tslint-automation loves to fix your linting errors! "+
        "Sometimes `tslint --fix` is enough, and then I'll offer to make a commit." +
        "Other times there are harder errors, and I'll list them for you in DM. Some of them I can fix with your approval, and I'll give you buttons for those." +
`
Currently:    
I will not offer to help: ${PeopleWhoDoNotWantMeToOfferToHelp.join(", ")}
I will always lint commits from: ${PeopleWhoWantLintingOnTheirBranches.join(", ")}`;
    await ctx.messageClient.respond(text);
    return Success;
}

export const reportConfigurationCommand: HandleCommand<ReportConfigurationParams> =
    commandHandlerFrom(reportConfiguration, ReportConfigurationParams, "ReportConfiguration",
    "Let me tell you about tslint-automation", "man tslint-automation");