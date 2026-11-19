import { parseArgs } from "node:util";
import { Option } from "@packages/ddd-kit";
import type {
  ChildRereadReport,
  RereadAnnouncementsService,
  RereadMode,
  RereadReport,
} from "../../application/services/reread-announcements.service";

export interface RereadCommandDeps {
  service: Pick<RereadAnnouncementsService, "reread">;
  userIdByEmail: (email: string) => Promise<Option<string>>;
  print: (line: string) => void;
  clock?: () => Date;
}

const REREAD_USAGE = `Usage: reread-announcements (--user <id> | --email <address>) [--child <id>] [--with-model] [--apply]

Rereads with the current extraction the announcements of one parent that already gave deadlines,
and fills the evidence and the preparation (parent actions, items to bring) of those deadlines.

  default       dry run: reads through the extraction cache only, never calls the model, writes nothing
  --with-model  dry run that calls the model on a cache miss (spends the family's AI quota, fills the cache)
  --apply       calls the model on a cache miss and saves the changed deadlines (agenda.event.updated)`;

const MODE_LABELS: Record<RereadMode, string> = {
  dry_run: "dry run, cache only, nothing written",
  dry_run_with_model: "dry run with model calls, nothing written",
  apply: "apply",
};

type Parent = { kind: "user"; userId: string } | { kind: "email"; email: string };

interface CommandArgs {
  parent: Parent;
  childId?: string;
  mode: RereadMode;
}

function modeOf(apply: boolean, withModel: boolean): RereadMode {
  if (apply) return "apply";

  return withModel ? "dry_run_with_model" : "dry_run";
}

function parsed(argv: string[]): CommandArgs | string {
  try {
    return argsOf(argv);
  } catch (error) {
    return error instanceof Error ? error.message : "unreadable arguments";
  }
}

function argsOf(argv: string[]): CommandArgs | string {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      user: { type: "string" },
      email: { type: "string" },
      child: { type: "string" },
      apply: { type: "boolean", default: false },
      "with-model": { type: "boolean", default: false },
    },
  });
  const parent = parentOf(values.user, values.email);
  if (parent === undefined) return "give exactly one of --user or --email";

  return {
    parent,
    ...(values.child === undefined ? {} : { childId: values.child }),
    mode: modeOf(values.apply, values["with-model"]),
  };
}

function parentOf(user: string | undefined, email: string | undefined): Parent | undefined {
  if (user !== undefined && email === undefined) return { kind: "user", userId: user };
  if (email !== undefined && user === undefined) return { kind: "email", email };

  return undefined;
}

function resolvedUser(parent: Parent, deps: RereadCommandDeps): Promise<Option<string>> {
  if (parent.kind === "user") return Promise.resolve(Option.some(parent.userId));

  return deps.userIdByEmail(parent.email);
}

function childLines(child: ChildRereadReport): string[] {
  const failures = Object.entries(child.failures).map(([code, count]) => `${code} ${count}`);

  return [
    `child ${child.label} (${child.childId}): ${child.status}`,
    `  courses ${child.courses}, skipped ${child.skippedCourses}`,
    `  announcements in the window ${child.announcementsInWindow}, with stored deadlines ${child.announcementsWithDeadlines}`,
    `  read without the model (cache or pre-filter) ${child.readWithoutModel}, read by the model ${child.readByModel}, model calls skipped ${child.modelCallsSkipped}`,
    `  reading paused by the family ${child.readingPaused}, failures ${failures.length === 0 ? "none" : failures.join(", ")}`,
    `  deadlines matched ${child.deadlines.matched}, changed ${child.deadlines.changed}, unmatched ${child.deadlines.unmatched}`,
  ];
}

function summary(report: RereadReport): string[] {
  const children = report.children.flatMap(childLines);

  return [
    `mode: ${MODE_LABELS[report.mode]}`,
    ...(children.length > 0 ? children : ["no linked child"]),
  ];
}

/**
 * Operator command over `RereadAnnouncementsService`: parses the arguments, resolves the parent
 * and prints one block per child. Returns the process exit code; the host owns the process.
 */
export async function runRereadAnnouncementsCommand(
  argv: string[],
  deps: RereadCommandDeps,
): Promise<number> {
  const args = parsed(argv);
  if (typeof args === "string") {
    deps.print(`${args}\n\n${REREAD_USAGE}`);
    return 2;
  }

  const userId = await resolvedUser(args.parent, deps);
  if (userId.isNone()) {
    deps.print("no parent account has this email");
    return 1;
  }

  const clock = deps.clock ?? (() => new Date());
  const report = await deps.service.reread(
    {
      userId: userId.unwrap(),
      mode: args.mode,
      ...(args.childId === undefined ? {} : { childId: args.childId }),
    },
    clock(),
  );
  if (report.isFailure) {
    deps.print(`${report.getError().code}: ${report.getError().message}`);
    return 1;
  }

  for (const line of summary(report.getValue())) deps.print(line);
  return 0;
}
