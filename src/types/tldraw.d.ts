import "@tldraw/tlschema";
import type {
	TLDefaultColorStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLRichText,
} from "@tldraw/tlschema";

declare module "@tldraw/tlschema" {
	interface TLGlobalShapePropsMap {
		"board-column": {
			collapsed: boolean;
			color: TLDefaultColorStyle;
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
			fill: TLDefaultFillStyle;
			h: number;
			minH: number;
			richText: TLRichText;
			size: TLDefaultSizeStyle;
			topBarColor: TLDefaultColorStyle;
			topBarEnabled: boolean;
			w: number;
		};
	}
}
