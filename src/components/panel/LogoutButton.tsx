import { logoutAction } from "@/app/panel/actions";
import { PanelIcon } from "./icons";
import { ICON_BUTTON, Tooltip } from "./ui";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Tooltip label="Log out">
        <button type="submit" aria-label="Log out" className={ICON_BUTTON}>
          <PanelIcon name="logout" />
        </button>
      </Tooltip>
    </form>
  );
}
