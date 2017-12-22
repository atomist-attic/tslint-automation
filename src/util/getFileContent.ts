import { api } from "./gitHubApi";

export function getFileContent(token: string,
                                repo: { name: string, owner: string, ref: string },
                                filePath: string): Promise<string> {

    return api(token).repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        ref: repo.ref,
    }).then(content => {
        const unencoded: string = new Buffer(content.data.content, 'base64').toString('ascii');

        console.log("unencoded: " + unencoded);

        return Promise.resolve(unencoded)
    })
}