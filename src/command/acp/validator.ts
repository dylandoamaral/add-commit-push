// eslint-disable-next-line no-unused-vars
import Preset from "../../preset";
import {
  errorTemplateExcess,
  errorTemplateMultiple,
  errorTemplateNeed,
  errorNumberArguments,
  errorNotKeyInMap,
  errorNoFile,
  errorFolderIsNotUpToDate,
  errorFolderDontNeedPull,
  errorFolderIsGitRepo,
  errorGitIsInstalled,
} from "../../utils/error";
import { execSync } from "child_process";
// eslint-disable-next-line no-unused-vars
import fs from "fs";
// eslint-disable-next-line no-unused-vars
import minimist from "minimist";

// eslint-disable-next-line no-unused-vars
import {
  Either,
  left,
  right,
  map,
  getValidation,
} from "fp-ts/lib/Either";
// eslint-disable-next-line no-unused-vars
import { NonEmptyArray, getSemigroup } from "fp-ts/lib/NonEmptyArray";
import { pipe } from "fp-ts/lib/pipeable";
import { sequenceT } from "fp-ts/lib/Apply";
import { array } from "fp-ts/lib/Array";
import {
  IOEither,
  tryCatch,
  leftIO,
  rightIO,
  getIOValidation,
  map as mapIOEither,
  swap,
  mapLeft as mapLeftIOEither,
  chain,
  fromEither,
} from "fp-ts/lib/IOEither";
import { constVoid } from "fp-ts/lib/function";
import { Acp, toAcp } from './acp';
import { getFlags } from '../command';
import { findGitRoot } from '../../utils/git';

/**
 * A bunch of validation before executing our acp commands
 */

const applicativeValidation = getValidation(getSemigroup<string>());

const ioeitherApplicativeValidation = getIOValidation(getSemigroup<string>());

const gitIsInstalled: IOEither<NonEmptyArray<string>, void> = tryCatch(
  () => pipe(execSync("git --version", { stdio: "ignore" }), constVoid),
  () => [errorGitIsInstalled()]
);

/**
 * Validate if the command is running inside a repository
 */
const folderIsGitRepo: IOEither<NonEmptyArray<string>, void> = tryCatch(
  () =>
    pipe(
      execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }),
      constVoid
    ),
  () => [errorFolderIsGitRepo()]
);

/**
 * Validate if the repository is not up to date compare to the remote one
 */
const folderIsNotUpToDate = (): IOEither<NonEmptyArray<string>, void> => {
  if (process.env.ACP_TEST === "true") return rightIO(constVoid);
  return execSync("git status --porcelain").toString() === ""
    ? leftIO(() => [errorFolderIsNotUpToDate()])
    : rightIO(constVoid);
};

/**
 * Validate if the repository doesn't need pull
 */
const folderDontNeedPull = (): IOEither<NonEmptyArray<string>, void> => {
  const needPull = ([base, local]: [string, string]): boolean => base === local;

  const base: IOEither<NonEmptyArray<string>, string> = tryCatch(
    () =>
      pipe(execSync("git rev-parse @ @{u}", { stdio: "ignore" }).toString()),
    () => [""]
  );

  const local: IOEither<NonEmptyArray<string>, string> = tryCatch(
    () => pipe(execSync("git rev-parse @", { stdio: "ignore" }).toString()),
    () => [""]
  );

  return pipe(
    sequenceT(ioeitherApplicativeValidation)(base, local),
    mapIOEither(needPull),
    swap,
    mapIOEither(constVoid),
    mapLeftIOEither(() => [errorFolderDontNeedPull()])
  );
};

/**
 * Validate all validation that refer to git
 */
export const validateGit = (): IOEither<NonEmptyArray<string>, string> =>
  pipe(
    gitIsInstalled,
    chain(() => folderIsGitRepo),
    chain(folderIsNotUpToDate),
    chain(folderDontNeedPull),
    mapIOEither(findGitRoot())
  );

/**
 * Validate if the preset and the args are compatible
 * @param args
 * @param preset
 */
const validatePreset = (
  args: string[],
  preset: Preset
): Either<NonEmptyArray<string>, void> => {
  /**
   * check if a sequence exist and is uniq inside a sentence
   * @param sequence
   * @param sentence
   */
  const uniq = (sequence: string, sentence: string): boolean => {
    return sentence.split(sequence).length === 2;
  };

  /**
   * check if a needed sequence really exist once inside a sentence and return an error otherwise
   * @param sequence
   * @param sentence
   */
  const need = (
    sequence: string,
    sentence: string
  ): Either<NonEmptyArray<string>, void> => {
    if (!uniq(sequence, sentence)) {
      if (sentence.includes(sequence))
        return left([errorTemplateMultiple(sequence, sentence)]);
      else return left([errorTemplateNeed(sequence, sentence)]);
    }
    return right(null);
  };

  /**
   * check if a non needed sequence really not exist inside a sentence and return an error otherwise
   * @param sequence
   * @param sentence
   */
  const excess = (
    sequence: string,
    sentence: string
  ): Either<NonEmptyArray<string>, void> => {
    if (sentence.includes(sequence))
      return left([errorTemplateExcess(sequence, sentence)]);
    return right(null);
  };

  /**
   * check if a key exist inside a map and return an error otherwise
   * @param key
   * @param map
   * @param map_name
   */
  const exist = (
    key: string,
    map: Map<string, string>,
    map_name: string
  ): Either<NonEmptyArray<string>, void> => {
    if (!map.has(key)) return left([errorNotKeyInMap(key, map, map_name)]);
    return right(null);
  };

  switch (args.length) {
    // case : acp <message>
    case 1:
      return pipe(
        sequenceT(applicativeValidation)(
          need("<message>", preset.template),
          excess("<action>", preset.template),
          excess("<target>", preset.template)
        ),
        map(() => null)
      );
    // case : acp <action> <message>
    case 2:
      return pipe(
        sequenceT(applicativeValidation)(
          need("<message>", preset.template),
          need("<action>", preset.template),
          excess("<target>", preset.template),
          exist(args[0], preset.actions, "actions")
        ),
        map(() => null)
      );
    // case : acp <action> <target> <message>
    case 3:
      return pipe(
        sequenceT(applicativeValidation)(
          need("<action>", preset.template),
          need("<message>", preset.template),
          need("<target>", preset.template),
          exist(args[0], preset.actions, "actions"),
          exist(args[1], preset.targets, "targets")
        ),
        map(() => null)
      );
    default:
      return left([errorNumberArguments()]);
  }
};

const validateSource = (source: string): Either<NonEmptyArray<string>, void> =>
  fs.existsSync(source) === false ? left([errorNoFile(source)]) : right(null);

const validateSources = (
  sources: string[]
): Either<NonEmptyArray<string>, void> => {
  const validations: Either<NonEmptyArray<string>, void>[] = sources.map(
    validateSource
  );

  return pipe(
    array.sequence(applicativeValidation)(validations),
    map(() => null)
  );
};

/**
 * validate a command according to his preset and his arguments
 * @param args
 * @param preset
 */
const validate = (args: minimist.ParsedArgs) => (
  preset: Preset
): IOEither<NonEmptyArray<string>, Acp> => {
  return pipe(
    sequenceT(ioeitherApplicativeValidation)(
      fromEither(validatePreset(args._, preset)),
      fromEither(validateSources(getFlags(args, "S", "source")))
    ),
    mapIOEither(() => toAcp([args, preset]))
  );
};

export default validate;
