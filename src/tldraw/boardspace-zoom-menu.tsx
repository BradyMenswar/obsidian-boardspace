import {
	DefaultZoomMenu,
	DefaultZoomMenuContent,
	ToggleGridItem,
} from "tldraw";
import { BoardspaceCanvasToneMenu } from "./boardspace-canvas-tone";

export function BoardspaceZoomMenu() {
	return (
		<DefaultZoomMenu>
			<DefaultZoomMenuContent />
			<ToggleGridItem />
			<BoardspaceCanvasToneMenu />
		</DefaultZoomMenu>
	);
}
