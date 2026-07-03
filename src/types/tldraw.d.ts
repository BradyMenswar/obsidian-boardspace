import "@tldraw/tlschema";
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLRichText,
} from "@tldraw/tlschema";

type BoardspaceShapeColor = TLDefaultColorStyle | "custom";
type BoardspaceTopBarColor = TLDefaultColorStyle | "transparent" | "custom";

declare module "@tldraw/tlschema" {
	interface TLGlobalShapePropsMap {
		"board-column": {
			collapsed: boolean;
			color: BoardspaceShapeColor;
			customColor: string;
			dash: TLDefaultDashStyle;
			fill: TLDefaultFillStyle;
			h: number;
			minH: number;
			size: TLDefaultSizeStyle;
			title: string;
			topBarColor: BoardspaceTopBarColor;
			topBarCustomColor: string;
			w: number;
		};
		"board-note": {
			color: BoardspaceShapeColor;
			customColor: string;
			dash: TLDefaultDashStyle;
			fill: TLDefaultFillStyle;
			h: number;
			minH: number;
			richText: TLRichText;
			size: TLDefaultSizeStyle;
			topBarColor: BoardspaceTopBarColor;
			topBarCustomColor: string;
			w: number;
		};
		"board-link": {
			boardCount: number;
			cardCount: number;
			color: BoardspaceShapeColor;
			customColor: string;
			dash: TLDefaultDashStyle;
			filePath: string;
			fill: TLDefaultFillStyle;
			h: number;
			icon: "board" | "bookmark" | "folder" | "lightbulb" | "layers" | "sparkle";
			size: TLDefaultSizeStyle;
			title: string;
			topBarColor: BoardspaceTopBarColor;
			topBarCustomColor: string;
			w: number;
		};
		"board-swatch": {
			colorValue: string;
			h: number;
			labelMode: "none" | "hex" | "rgb" | "hsl";
			w: number;
		};
		"board-todo": {
			color: BoardspaceShapeColor;
			customColor: string;
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
			topBarColor: BoardspaceTopBarColor;
			topBarCustomColor: string;
			w: number;
		};
	}
}
