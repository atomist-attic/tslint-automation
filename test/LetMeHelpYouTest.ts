/**
 * Once upon a time, there was a helpful automation, that knew how to run tslint --fix.
 * Every commit that everyone made, this automation checked it out and ran tslint --fix.
 * Sometimes tslint --fix actually made a fix! And then the automation made a commit with
 * that fix, so the person doesn't have to!
 *
 * But then some people grew frustrated, because when tslint-automation made a commit on
 * their branch, that conflicted with changes they have locally.
 * tslint-automation sent them a Slack DM asking them to pull, but still that wasn't enough
 * to assuage their frustration.
 *
 * So tslint-automation changed to a hard-coded list of only a few people, on top of whose
 * commits it was allowed to push fixes. And those few people were happy, and no one was
 * frustrated. But what about all the people not on that list, who don't even know that
 * tslint-automation could be helping them??
 *
 * tslint-automation wants to offer to help these people. It can check out their commits,
 * and it can run tslint --fix, and if it could help by pushing a fix, maybe it can ask them?
 * ... and then if they like the idea, the person can push a button to be added to the list
 * of users that tslint-automation is allowed to help!
 */

import { NodeFsLocalProject } from "@atomist/automation-client/project/local/NodeFsLocalProject";
import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import * as appRoot from "app-root-path";
import * as _ from "lodash";
import "mocha";
import * as assert from "power-assert";
import {
    lintingIsWanted, PeopleWhoDoNotWantMeToOfferToHelp, PeopleWhoWantLintingOnTheirBranches,
    shouldOfferToHelp,
} from "../src/handlers/PushToTsLinting";
import { addPersonWhoDoesNotWantMeToOfferToHelp } from "../src/handlers/Configuration/SelfConfigurate";

describe("Before I can even ask, people have to be able to tell me not to offer", () => {
    it("does not offer to make a commit for an author in the grouchy list", () => {
        const personOnTheList = _.shuffle(PeopleWhoDoNotWantMeToOfferToHelp).pop();

        assert(!shouldOfferToHelp(personOnTheList));
    });

    it("does offer for a person not on the list", () => {
        const personNotOnTheList = possibleAuthors()
            .filter(a => !PeopleWhoDoNotWantMeToOfferToHelp.includes(a))
            .pop();

        assert(shouldOfferToHelp(personNotOnTheList));
    });

    it("can add a person to the list", done => {
        // how do I load this project into memory again?
        NodeFsLocalProject.fromExistingDirectory({ owner: "jess", repo: "this-one" },
            appRoot.path)
            .then(local => InMemoryProject.cache(local))
            .then(thisProject => addPersonWhoDoesNotWantMeToOfferToHelp("sad-panda")(thisProject, null))
            .then(editResult => {
                assert(editResult.success);
                assert(editResult.edited);
                const changedContent = editResult.target.findFileSync("src/handlers/PushToTsLinting.ts").getContentSync();
                assert(changedContent.includes(`"sad-panda",`));
            }).then(() => done(), done);
    });
});

describe("Modifying the list of users we are allowed to help", () => {

    it("does not make a commit for a person not on the list", () => {
        const personNotOnTheList = possibleAuthors()
            .filter(a => !PeopleWhoWantLintingOnTheirBranches.includes(a))
            .pop();

        assert(!lintingIsWanted(null, personNotOnTheList));
    });

    it("makes a commit for a person on the list", () => {
        const personOnTheList = _.shuffle(PeopleWhoWantLintingOnTheirBranches).pop();

        assert(lintingIsWanted(null, personOnTheList));
    });

});

function possibleAuthors() {
    return _.shuffle(["cd", "rod", "jessitron", "frank", "someone-else"]);
}
