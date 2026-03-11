export const APP_TAB_BAR_ITEM_HEIGHT = 65;
export const APP_TAB_BAR_PADDING_TOP = 12;
export const APP_TAB_BAR_MIN_BOTTOM_INSET = 8;
export const APP_TAB_BAR_BORDER_TOP_WIDTH = 1;

export function getAppTabBarHeight(bottomInset: number) {
  const inset = Math.max(Number(bottomInset) || 0, APP_TAB_BAR_MIN_BOTTOM_INSET);
  return APP_TAB_BAR_ITEM_HEIGHT + APP_TAB_BAR_PADDING_TOP + inset + APP_TAB_BAR_BORDER_TOP_WIDTH;
}
