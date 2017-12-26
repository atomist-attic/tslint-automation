import * as stringify from "json-stringify-safe";
import "mocha";
import { runTslint } from "../src/handlers/PushToTsLinting";

describe("can we lint the thing?", () => {

    it("can lint a thing", done => {
        runTslint("/Users/jessitron/code/atomist/upgrade-client-automation")
            .then(
                result => {
                    console.log("what");
                    console.log(stringify(result));
                })
            .then(() => done(), done);
    }).timeout(100000);
});
