# Build Plan

## Goal
Create a lightweight web app where users play with a 7-day availability matrix and try to pick a slot before the grid randomizes again every 2 seconds. The experience should feel like a timing game: the grid changes constantly, the selected slot stays protected, and the user has to react quickly to schedule the slot before it changes.

## Steps

1. Set up the project structure
   - Keep the app simple with `index.html`, `style.css`, `server.js`, and `client.js` in the workspace root.
   - Add a minimal `package.json` if needed so dependencies are explicit and the app can be started consistently.
   - Use only Express and Socket.IO on the server side.
   - Use port `8080`.
   - Keep all code lightweight and avoid any UI frameworks or styling libraries.

2. Build the server
   - Create `server.js` with Express to serve the static frontend files.
   - Attach Socket.IO to the same HTTP server so the client can receive live updates.
   - Create a small in-memory data model for the availability matrix, representing time slots across 7 days.
   - Store the current selection, scheduled slots, and random availability state on the server so all clients stay in sync.
   - Broadcast state updates on a timer every 2 seconds.
   - Expose a clean Socket.IO event contract for things like initial sync, selection updates, scheduling attempts, and state refreshes.

3. Design the page layout
   - Create `index.html` with a main grid showing time slots on one axis and the 7 days of the week on the other.
   - Place the matrix in a centered panel with a title, short instructions, and a visible game status area.
   - Add buttons for selecting a slot and a separate action for scheduling the selected slot.
   - Include clear status text so the user knows what is currently selected, what the current randomization phase is, and whether scheduling succeeded.
   - Add a small legend explaining the colors for available, unavailable, selected, locked, and scheduled states.

4. Apply the visual theme
   - Create `style.css` using the provided palette-inspired colors.
   - Use the bright theme family from the reference image with exact palette values:
     - Honeydew: `#F6FFE9`
     - Vanilla Custard: `#F2E0A4`
     - Periwinkle: `#CAC5E5`
     - Amethyst: `#A230A4`
     - Dark Ultramarine: `#290087`
   - Use those colors as CSS custom properties so the theme is easy to maintain.
   - Build a vivid background using gradients and soft glows inspired by the reference image.
   - Make the matrix readable, playful, and game-like without using any CSS frameworks.
   - Style selected, available, unavailable, randomizing, locked, and scheduled states distinctly.
   - Ensure the interface still works on smaller screens by letting the grid scroll or reflow cleanly.

5. Implement the client behavior
   - Create `client.js` to connect to Socket.IO from the browser.
   - Render the slot matrix on the page using the current server state.
   - Handle button clicks for selecting a slot and scheduling it.
   - Update the UI immediately when new availability data arrives from the server.
   - Keep the currently selected slot visually persistent even while the rest of the grid changes.
   - Disable or ignore actions that are no longer valid after a randomization update.
   - Show immediate feedback messages for success, conflict, and invalid actions.

6. Implement the randomization game loop
   - On the server, randomize the availability matrix every 2 seconds.
   - Randomize only the non-selected, non-scheduled slots.
   - Broadcast the updated matrix to all connected clients.
   - Preserve the user’s currently selected slot so it does not get changed by the randomization.
   - Make the rest of the grid change continuously so the page feels like a timing game.
   - Optionally include a countdown or pulse effect so the player can anticipate the next change.

7. Define the scheduling logic
   - When a user clicks a slot, mark it as the active selection on the client.
   - When the user clicks schedule, verify the selection is still available.
   - If valid, mark the slot as scheduled and send the update through Socket.IO.
   - If the slot is no longer available, show a clear error or retry message.
   - Ensure the schedule action updates both the server state and every connected client.
   - Prevent duplicate scheduling and conflicting selections.

8. Add useful UX feedback
   - Show countdown or update timing so users know when the next randomization is coming.
   - Display messages for selected, scheduled, locked, and invalid actions.
   - Add small visual transitions so state changes feel alive without becoming distracting.
   - Keep the experience fast and readable on desktop and mobile.

9. Test the full flow
   - Verify the server starts on port `8080`.
   - Confirm the matrix renders correctly in the browser.
   - Check that randomization updates every 2 seconds.
   - Confirm the selected slot stays fixed while other slots continue changing.
   - Confirm scheduling works only when the slot is still valid.
   - Test socket reconnect behavior so a refreshed browser can resync cleanly.
   - Test the interface with multiple tabs to confirm shared state updates correctly.

10. Polish and finalize
   - Tidy naming and comments so the logic is easy to follow.
   - Make sure the code stays lightweight and consistent across all files.
   - Do a final pass for browser errors, server errors, and layout issues.
   - Confirm the palette is applied consistently across text, panels, buttons, borders, and hover states.
   - Check that the page still looks intentional if the matrix has many unavailable slots or many selected states.

## Deliverables
- `index.html` for the main UI
- `style.css` for the themed layout and states
- `server.js` for the Express + Socket.IO backend
- `client.js` for browser interaction and live updates
- Slot randomization and scheduling logic that powers the game