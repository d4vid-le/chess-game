# Chess Game with AI Opponent

A web-based chess game built with Next.js and React where you can play against an AI opponent powered by your local LM Studio instance.

## Features

- Interactive chess board with drag-and-drop piece movement
- AI opponent powered by LM Studio
- Game state tracking (check, checkmate, draw)
- Responsive design that works on desktop and mobile
- Settings panel to configure LM Studio connection

## Technologies Used

- Next.js 15 with App Router
- React 18
- TypeScript
- Tailwind CSS
- chess.js (for chess logic)
- react-chessboard (for the UI)
- Axios (for API calls to LM Studio)

## Getting Started

### Prerequisites

- Node.js 18 or later
- LM Studio running locally with an API endpoint

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser

## LM Studio Integration

The chess game connects to your local LM Studio instance to power the AI opponent. Make sure LM Studio is running and accessible at the URL configured in the application settings.

Default URL: `http://localhost:11434/v1`

The application sends the current board state to LM Studio and expects a valid chess move in return. The AI is instructed to play as black and provide moves in algebraic notation.

## How to Play

1. You play as white, and the AI plays as black
2. Make your move by dragging and dropping pieces on the board
3. The AI will automatically respond with its move
4. The game status is displayed below the board
5. Use the "Reset Game" button to start a new game

## License

This project is open source and available under the MIT License.
