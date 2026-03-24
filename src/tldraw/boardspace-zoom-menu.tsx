import {
	DefaultZoomMenu,
	DefaultZoomMenuContent,
	ToggleGridItem,
} from "tldraw";

export function BoardspaceZoomMenu() {
	return (
		<DefaultZoomMenu>
			<DefaultZoomMenuContent />
			<ToggleGridItem />
		</DefaultZoomMenu>
	);
}
