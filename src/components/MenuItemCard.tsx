"use client";

import clsx from "clsx";
import {
  SwipeableList,
  SwipeableListItem,
  LeadingActions,
  TrailingActions,
  SwipeAction,
} from "react-swipeable-list";
import "react-swipeable-list/dist/styles.css";

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: number | null;
  isTaxIncluded?: boolean;
  order: number;
};

export default function MenuItemCard({
  item,
  onDelete,
  onEdit,
  isLoggedIn,
}: {
  item: MenuItem;
  onDelete: () => void;
  onEdit: (item: MenuItem) => void;
  isLoggedIn: boolean;
}) {
  const yen = (n: number) => n.toLocaleString("ja-JP");

  const leading = () => (
    <LeadingActions>
      <SwipeAction onClick={() => onEdit(item)}>
        <div className="bg-emerald-500 text-white px-4 py-2 flex items-center justify-center whitespace-nowrap w-24 rounded-l">
          編集
        </div>
      </SwipeAction>
    </LeadingActions>
  );

  const trailing = () => (
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
      <SwipeableListItem
        leadingActions={isLoggedIn ? leading() : undefined}
        trailingActions={isLoggedIn ? trailing() : undefined}
      >
        <div className="flex justify-between items-center py-3 border-b px-2 rounded">
          <div>
            <p className={clsx("font-medium")}>
              {item.name}
              {item.price != null
                ? `：¥${yen(item.price)}${
                    typeof item.isTaxIncluded === "boolean"
                      ? `（${item.isTaxIncluded ? "税込" : "税別"}）`
                      : ""
                  }`
                : ""}
            </p>
            {item.description && (
              <p className="whitespace-pre-wrap text-sm text-gray-500">
                {item.description}
              </p>
            )}
          </div>
        </div>
      </SwipeableListItem>
    </SwipeableList>
  );
}
