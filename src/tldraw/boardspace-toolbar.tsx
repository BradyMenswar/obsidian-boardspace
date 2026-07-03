import {
	AssetToolbarItem,
	ArrowToolbarItem,
	DefaultToolbar,
	DrawToolbarItem,
	EraserToolbarItem,
	HandToolbarItem,
	NoteToolbarItem,
	SelectToolbarItem,
	ToolbarItem,
} from "tldraw";

export function BoardspaceToolbar() {
	return (
		<DefaultToolbar>
			<SelectToolbarItem />
			<HandToolbarItem />
			<DrawToolbarItem />
			<EraserToolbarItem />
			<ArrowToolbarItem />
			<NoteToolbarItem />
			<AssetToolbarItem />
			<ToolbarItem tool="todo" />
			<ToolbarItem tool="column" />
			<ToolbarItem tool="board-link" />
			<ToolbarItem tool="swatch" />
		</DefaultToolbar>
	);
}
