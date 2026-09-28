import { logoutAction } from "@/app/panel/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="text-sm underline underline-offset-2 hover:no-underline">
        Log out
      </button>
    </form>
  );
}
