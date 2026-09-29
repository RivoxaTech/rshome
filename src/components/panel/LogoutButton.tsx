import { logoutAction } from "@/app/panel/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2 transition-colors hover:no-underline"
      >
        Log out
      </button>
    </form>
  );
}
