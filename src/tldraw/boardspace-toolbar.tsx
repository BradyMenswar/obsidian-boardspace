import {
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
			<ToolbarItem tool="column" />
		</DefaultToolbar>
	);
}
