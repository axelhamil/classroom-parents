import { runRereadAnnouncementsCommand } from "@modules/classroom-sync/infrastructure/cli/reread-announcements.command";
import { Option } from "@packages/ddd-kit";
import { auth } from "../src/auth";
import { di } from "../src/container";

const userIdByEmail = async (email: string): Promise<Option<string>> => {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email);

  return Option.fromNullable(found?.user.id);
};

const exitCode = await runRereadAnnouncementsCommand(process.argv.slice(2), {
  service: di.RereadAnnouncementsService,
  userIdByEmail,
  print: (line) => console.log(line),
});

await di.IInstrumentation.flush(2_000);
process.exit(exitCode);
