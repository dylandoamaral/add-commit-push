#!/usr/bin/env node

import { pipe } from "fp-ts/lib/pipeable";
import {
    loadArguments,
    routeCommands,
    executeCommand,
    showError,
} from "./command/command";
import { IO } from "fp-ts/lib/IO";
import { getOrElse, chain, rightIO, map } from "fp-ts/lib/IOEither";

const program: IO<void> = pipe(
    rightIO(loadArguments),
    map(routeCommands),
    chain(executeCommand),
    getOrElse(showError)
);

program();
