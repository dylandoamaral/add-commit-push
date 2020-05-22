// eslint-disable-next-line no-unused-vars
import { tryCatch, IOEither, leftIO, rightIO, chain } from "fp-ts/lib/IOEither";
// eslint-disable-next-line no-unused-vars
import { NonEmptyArray } from "fp-ts/lib/NonEmptyArray";
// eslint-disable-next-line no-unused-vars
import { IO } from "fp-ts/lib/IO";
import { pipe } from "fp-ts/lib/pipeable";
import { execSync } from "child_process";
import { merge } from "./functionnal";
import { constVoid } from "fp-ts/lib/function";

import {
    errorGitIsInstalled,
    errorUpdateRemoteFailed,
    errorFolderIsGitRepo,
    errorFolderIsNotUpToDate,
    errorFolderDontNeedPull,
} from "./error";

/**
 * find the root of the current git project
 */
export const findGitRoot: IO<string> = pipe(
    tryCatch(
        () => execSync("git rev-parse --show-toplevel").toString().trim(),
        () => process.cwd()
    ),
    merge
);

/**
 * check if git is installed
 */
export const gitIsInstalled: IOEither<NonEmptyArray<string>, void> = tryCatch(
    () => pipe(execSync("git --version", { stdio: "ignore" }), constVoid),
    () => [errorGitIsInstalled()]
);

/**
 * update the remote repository
 */
export const gitUpdateRemote: IOEither<NonEmptyArray<string>, void> = tryCatch(
    () => pipe(execSync("git remote update", { stdio: "ignore" }), constVoid),
    () => [errorUpdateRemoteFailed()]
);

/**
 * Validate if the command is running inside a repository
 */
export const folderIsGitRepo: IOEither<NonEmptyArray<string>, void> = tryCatch(
    () => pipe(execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }), constVoid),
    () => [errorFolderIsGitRepo()]
);

/**
 * Validate if the repository is not up to date compare to the remote one
 */
export const folderIsNotUpToDate = (): IOEither<NonEmptyArray<string>, void> =>
    execSync("git status --porcelain").toString() === "" ? leftIO(() => [errorFolderIsNotUpToDate()]) : rightIO(constVoid);

/**
 * Validate if the repository doesn't need pull
 */
export const folderDontNeedPull = (): IOEither<NonEmptyArray<string>, void> => {
    const checkStatus: IOEither<NonEmptyArray<string>, boolean> = tryCatch(
        () => execSync("git status -uno").toString().includes("git pull"),
        () => ["Can't run the command 'git status -uno'"]
    );

    const needPull = (pull: boolean): IOEither<NonEmptyArray<string>, void> => {
        if (pull) return leftIO(() => [errorFolderDontNeedPull()]);
        else return rightIO(null);
    };

    return pipe(checkStatus, chain(needPull));
};
