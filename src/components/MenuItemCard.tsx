import { ThemeKey, THEMES } from "@/lib/themes";
import { useThemeGradient } from "@/lib/useThemeGradient";
import clsx from "clsx";
import { useMemo } from "react";
import {
  SwipeableList,
  SwipeableListItem,
  TrailingActions,
  SwipeAction,
} from "react-swipeable-list";
import "react-swipeable-list/dist/styles.css";

export default function MenuItemCard({
  item,
  onDelete,
  isLoggedIn,
}: {
  item: any;
  onDelete: () => void;
  isLoggedIn: boolean;
}) {
  const gradient = useThemeGradient();

  const isDark = useMemo(() => {
    const darkThemes: ThemeKey[] = ["brandG", "brandH", "brandI"];
    if (!gradient) return false;
    return darkThemes.some((key) => gradient === THEMES[key]);
  }, [gradient]);

  const trailingActions = () => (
    <TrailingActions>
      <SwipeAction onClick={onDelete}>
        <div className="bg-red-500 text-white px-4 py-2 flex items-center justify-center whitespace-nowrap w-24 rounded-r">
          削除
        </div>
      </SwipeAction>
    </TrailingActions>
  );

  return (
    <SwipeableList threshold={0.25}>
      <SwipeableListItem trailingActions={isLoggedIn && trailingActions()}>
        <div className="flex justify-between items-center py-3 border-b px-2 rounded">
          <div>
            <p className={clsx("font-medium", isDark && "text-white")}>
              {item.name}
              {/* 価格が0または未入力なら表示しない */}
              {item.price
                ? `：¥${item.price}${
                    typeof item.isTaxIncluded === "boolean"
                      ? `（${item.isTaxIncluded ? "税込" : "税別"}）`
                      : ""
                  }`
                : ""}
            </p>
            {item.description && (
              <p
                className={clsx(
                  "whitespace-pre-wrap text-sm text-gray-500",
                  isDark && "text-white"
                )}
              >
                {item.description}
              </p>
            )}
          </div>
        </div>
      </SwipeableListItem>
    </SwipeableList>
  );
}
