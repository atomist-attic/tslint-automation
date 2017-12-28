#!/bin/bash
# build and test a node package

set -o pipefail

declare Pkg=travis-build-node
declare Version=1.2.0

# write message to standard out (stdout)
# usage: msg MESSAGE
function msg() {
    echo "$Pkg: $*"
}

# write message to standard error (stderr)
# usage: err MESSAGE
function err() {
    msg "$*" 1>&2
}

# git tag and push
# usage: git-tag TAG[...]
function git-tag () {
    if [[ ! $1 ]]; then
        err "git-tag: missing required argument: TAG"
        return 10
    fi

    if ! git config --global user.email "travis-ci@atomist.com"; then
        err "failed to set git user email"
        return 1
    fi
    if ! git config --global user.name "Travis CI"; then
        err "failed to set git user name"
        return 1
    fi
    local tag
    for tag in "$@"; do
        if ! git tag "$tag" -m "Generated tag from Travis CI build $TRAVIS_BUILD_NUMBER"; then
            err "failed to create git tag: '$tag'"
            return 1
        fi
    done
    local remote=origin
    if [[ $GITHUB_TOKEN ]]; then
        remote=https://$GITHUB_TOKEN:x-oauth-basic@github.com/$TRAVIS_REPO_SLUG.git
    fi
    if ! git push --quiet "$remote" "$@" > /dev/null 2>&1; then
        err "failed to push git tag(s): $*"
        return 1
    fi
}

# create and set a prerelease timestamped, and optionally branched, version
# usage: set-timestamp-version [BRANCH]
function set-timestamp-version () {
    local branch=$1 prerelease
    if [[ $branch && $branch != master ]]; then
        shift
        local safe_branch
        safe_branch=$(echo -n "$branch" | tr -C -s '[:alnum:]-' . | sed -e 's/^[-.]*//' -e 's/[-.]*$//')
        if [[ $? -ne 0 || ! $safe_branch ]]; then
            err "failed to create safe branch name from '$branch': $safe_branch"
            return 1
        fi
        prerelease=$safe_branch.
    fi

    local pkg_version pkg_json=package.json
    pkg_version=$(jq -er .version "$pkg_json")
    if [[ $? -ne 0 || ! $pkg_version ]]; then
        err "failed to parse version from $pkg_json"
        return 1
    fi
    local timestamp
    timestamp=$(date -u +%Y%m%d%H%M%S)
    if [[ $? -ne 0 || ! $timestamp ]]; then
        err "failed to generate timestamp"
        return 1
    fi
    local project_version=$pkg_version-$prerelease$timestamp
    if ! npm version --git-tag-version false "$project_version"; then
        err "failed to set package version: $project_version"
        return 1
    fi
}

# post a status on a commit
# usage: git-status [CONTEXT [DESCRIPTION [URL [STATE]]]]
function git-status () {
    local context=$1
    if [[ $context ]]; then
        shift
    else
        context=default
    fi
    local description=$1
    if [[ $description ]]; then
        shift
    fi
    local target_url=$1
    if [[ $target_url ]]; then
        shift
    fi
    local state=$1
    if [[ $state ]]; then
        shift
        case "$state" in
            error | failure | pending | success)
                :;;
            *)
                err "invalid commit status state: '$state'"
                return 10
                ;;
        esac

    else
        state=success
    fi

    local sha
    if [[ $TRAVIS_PULL_REQUEST_SHA ]]; then
        sha=$TRAVIS_PULL_REQUEST_SHA
    else
        sha=$TRAVIS_COMMIT
    fi

    local status_url=https://api.github.com/repos/$TRAVIS_REPO_SLUG/statuses/$sha
    local post_data
    printf -v post_data '{"state":"%s","target_url":"%s","description":"%s","context":"%s"}' "$state" "$target_url" "$description" "$context"
    if ! curl -s -f -H 'Accept: application/vnd.github.v3+json' \
            -H 'Content-Type: application/json' \
            -H "Authorization: token $GITHUB_TOKEN" \
            -X POST -d "$post_data" "$status_url" > /dev/null
    then
        err "failed to post status on commit: $sha"
        return 1
    fi
}

# create and push a Docker image
# usage: docker-push IMAGE VERSION
function docker-push () {
    local image_name=$1
    if [[ ! $image_name ]]; then
        err "docker-push: missing required argument: NAME"
        return 10
    fi
    shift
    local image_version=$1
    if [[ ! $image_version ]]; then
        err "docker-push: missing required argument: VERSION"
        return 10
    fi
    shift

    if [[ ! $DOCKER_REGISTRY ]]; then
        msg "no Docker registry set"
        msg "skipping Docker build and push"
        return 0
    fi

    if ! docker login -u "$DOCKER_USER" -p "$DOCKER_PASSWORD" "$DOCKER_REGISTRY"; then
        err "failed to login to docker registry: $DOCKER_REGISTRY"
        return 1
    fi

    local tag=$DOCKER_USER/$image_name:$image_version
    if ! docker build . -t "$tag"; then
        err "failed to build docker image: '$tag'"
        return 1
    fi

    if ! docker push "$tag"; then
        err "failed to push docker image: '$tag'"
        return 1
    fi

    # github commit status requires an http(s) URL, so prepend tag with that
    if ! git-status docker/atomist "Docker image tag" "https://$tag"; then
       err "failed to create GitHub commit status for Docker image tag '$tag'"
       return 1
    fi
}

# usage: main "$@"
function main () {
    local arg ignore_lint
    for arg in "$@"; do
        case "$arg" in
            --ignore-lint | --ignore-lin | --ignore-li | --ignore-l)
                ignore_lint=1
                ;;
            -*)
                err "unknown option: $arg"
                return 2
                ;;
        esac
    done

    msg "running compile"
    if ! npm run compile; then
        err "compilation failed"
        return 1
    fi

    msg "running tests"
    if ! npm test; then
        err "test failed"
        return 1
    fi

    msg "running lint"
    local lint_status
    npm run lint
    lint_status=$?
    if [[ $lint_status -eq 0 ]]; then
        :
    elif [[ $lint_status -eq 2 ]]; then
        err "TypeScript failed to pass linting"
        if [[ $ignore_lint ]]; then
            err "ignoring linting failure"
        else
            return 1
        fi
    else
        err "tslint errored"
        return 1
    fi

    if ! docker-push linting-automation $TRAVIS_BUILD_NUMBER; then
        err "docker build and push failed"
        return 1
    fi
}

main "$@" || exit 1
exit 0
