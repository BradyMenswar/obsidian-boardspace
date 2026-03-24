import "@tldraw/tlschema";
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLRichText,
} from "@tldraw/tlschema";

declare module "@tldraw/tlschema" {
	interface TLGlobalShapePropsMap {
		"board-column": {
			collapsed: boolean;
			color: TLDefaultColorStyle;
			dash: TLDefaultDashStyle;
			fill: TLDefaultFillStyle;
			h: number;
			minH: number;
			size: TLDefaultSizeStyle;
			title: string;
			topBarColor: TLDefaultColorStyle;
			topBarEnabled: boolean;
			w: number;
		};
		"board-note": {
			color: TLDefaultColorStyle;
			dash: TLDefaultDashStyle;
			fill: TLDefaultFillStyle;
			h: number;
			minH: number;
			richText: TLRichText;
			size: TLDefaultSizeStyle;
			topBarColor: TLDefaultColorStyle;
			topBarEnabled: boolean;
			w: number;
		};
		"board-todo": {
			color: TLDefaultColorStyle;
			dash: TLDefaultDashStyle;
			fill: TLDefaultFillStyle;
			h: number;
			size: TLDefaultSizeStyle;
			tasks: Array<{
				checked: boolean;
				id: string;
				text: string;
			}>;
			title: string;
			topBarColor: TLDefaultColorStyle;
			topBarEnabled: boolean;
			w: number;
		};
	}
}
