import { logoutAction } from "@/app/panel/actions";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        title="Log out"
        aria-label="Log out"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground rounded-md p-2 transition-colors"
      >
        <Icon d={ICON_PATHS.logout} className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}
