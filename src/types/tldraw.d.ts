import "@tldraw/tlschema";
import type {
	TLDefaultColorStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLRichText,
} from "@tldraw/tlschema";

declare module "@tldraw/tlschema" {
	interface TLGlobalShapePropsMap {
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
