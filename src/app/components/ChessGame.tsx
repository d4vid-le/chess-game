import React, { useState, useEffect, useCallback } from 'react';
import { Chess, Move, PieceSymbol, Square } from 'chess.js'; // Import necessary types
import { Chessboard } from 'react-chessboard';
import { checkLMStudioConnection, fetchRawAIMove, ConnectionStatus } from '../services/lmStudioService'; // Import service functions

interface ChessGameProps {
  lmStudioUrl: string;
}

// Define PieceType for indexing and clarity
type PieceType = 'q' | 'r' | 'b' | 'n' | 'p' | 'k';
const pieceOrder: Record<PieceType, number> = { q: 1, r: 2, b: 3, n: 4, p: 5, k: 6 };

export default function ChessGame({ lmStudioUrl }: ChessGameProps) {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState('White to move');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAIMove, setLastAIMove] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: false, modelId: null });
  const [aiMoveSource, setAiMoveSource] = useState<'LM Studio' | 'Smart Fallback' | ''>('');
  const [aiThinking, setAiThinking] = useState<string>('');
  const [moveQuality, setMoveQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | ''>('');
  const [capturedPieces, setCapturedPieces] = useState<{ w: { type: PieceType; count: number }[], b: { type: PieceType; count: number }[] }>({ w: [], b: [] });
  const [moveHistory, setMoveHistory] = useState<{ san: string, color: string }[]>([]);
  const [savedGames, setSavedGames] = useState<{ name: string, fen: string, timestamp: number }[]>([]);
  const [gameStates, setGameStates] = useState<string[]>([]);
  const [currentStateIndex, setCurrentStateIndex] = useState<number>(-1);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState<boolean>(false);
  const [promotionMove, setPromotionMove] = useState<{ from: Square, to: Square } | null>(null);
  const [showPromotionModal, setShowPromotionModal] = useState<boolean>(false);

  // --- Utility Functions ---

  const getPieceSymbol = (piece: string, _color: string) => {
    const symbols: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
    return symbols[piece.toLowerCase()] || '';
  };

  const getPieceName = (pieceType: PieceSymbol | undefined): string => {
    if (!pieceType) return 'piece';
    switch (pieceType.toLowerCase()) {
      case 'p': return 'pawn';
      case 'n': return 'knight';
      case 'b': return 'bishop';
      case 'r': return 'rook';
      case 'q': return 'queen';
      case 'k': return 'king';
      default: return 'piece';
    }
  };

  const addCapturedPiece = (piece: { type: PieceSymbol; color: 'w' | 'b' }) => {
    if (!(piece.type in pieceOrder)) return;
    const pieceType = piece.type as PieceType;
    setCapturedPieces(prev => {
      const capturedColorKey = piece.color === 'w' ? 'w' : 'b';
      const newCaptured = { ...prev };
      const targetArray = newCaptured[capturedColorKey];
      const existingPieceIndex = targetArray.findIndex(p => p.type === pieceType);
      if (existingPieceIndex > -1) {
        targetArray[existingPieceIndex].count += 1;
      } else {
        targetArray.push({ type: pieceType, count: 1 });
      }
      targetArray.sort((a, b) => (pieceOrder[a.type] || 99) - (pieceOrder[b.type] || 99));
      return newCaptured;
    });
  };

  // --- Game State and Status Updates ---

  // Update FEN and save state for undo/redo whenever the game object changes
  useEffect(() => {
    const currentFen = game.fen();
    setFen(currentFen); // Update FEN state for the board

    // Save state for undo/redo
    if (currentStateIndex === -1) {
      setGameStates([currentFen]);
      setCurrentStateIndex(0);
    } else if (gameStates[currentStateIndex] !== currentFen) {
      const newStates = gameStates.slice(0, currentStateIndex + 1);
      newStates.push(currentFen);
      setGameStates(newStates);
      setCurrentStateIndex(newStates.length - 1);
    }
  }, [game]); // Depend directly on the game state object

  // Update game status and move history based on the current game state
  useEffect(() => {
    if (game.isGameOver()) {
      if (game.isCheckmate()) setGameStatus(`Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!`);
      else if (game.isDraw()) setGameStatus('Draw!');
      else setGameStatus('Game over!');
    } else if (game.isCheck()) {
      setGameStatus(`${game.turn() === 'w' ? 'White' : 'Black'} is in check!`);
    } else {
      setGameStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`);
    }

    const history = game.history({ verbose: true });
    const formattedHistory = history.map((move: Move) => ({
      san: move.san,
      color: move.color === 'w' ? 'white' : 'black'
    }));
    setMoveHistory(formattedHistory);
  }, [game]); // Depend directly on the game state object

  // --- LM Studio Connection ---

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      if (!isMounted) return;
      console.log('Checking LM Studio connection...');
      try {
        const status = await checkLMStudioConnection(lmStudioUrl);
        if (isMounted) {
          setConnectionStatus(status);
          if (status.connected) {
            console.log('%c✅ Successfully connected to LM Studio!', 'color: green; font-weight: bold; font-size: 14px;');
            console.log('Connected Model ID:', status.modelId);
          } else {
            console.log('%c❌ Failed to connect to LM Studio!', 'color: red; font-weight: bold; font-size: 14px;');
            console.log('%c⚠️ IMPORTANT: Make sure LM Studio is running with the server enabled!', 'color: yellow; font-weight: bold; font-size: 14px;');
            // ... (console logs for setup guide)
          }
        }
      } catch (error) {
        console.error('Error checking LM Studio connection in component:', error);
        if (isMounted) {
          setConnectionStatus({ connected: false, modelId: null, error: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    checkConnection();
    const intervalId = setInterval(checkConnection, 15000);
    return () => { isMounted = false; clearInterval(intervalId); };
  }, [lmStudioUrl]);

  // --- AI Move Logic ---

  const assessMoveQuality = (moveResult: Move): { quality: 'excellent' | 'good' | 'fair' | 'poor', reasoning: string } => {
    let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
    let reasoning = 'This move follows basic chess principles.';
    try {
      if (moveResult.san.includes('+') || moveResult.san.includes('#')) {
        quality = 'excellent'; reasoning = 'Puts the king in check.';
      } else if (moveResult.captured) {
        const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        const capturedValue = pieceValues[moveResult.captured] || 0;
        const movingValue = pieceValues[moveResult.piece] || 0;
        if (capturedValue > movingValue) { quality = 'excellent'; reasoning = `Captures a higher value piece (${getPieceName(moveResult.captured)}).`; }
        else if (capturedValue === movingValue) { quality = 'good'; reasoning = `Exchanges pieces of equal value (${getPieceName(moveResult.captured)}).`; }
        else { quality = 'fair'; reasoning = `Captures a lower value piece (${getPieceName(moveResult.captured)}).`; }
      } else if (moveResult.promotion) {
        quality = 'excellent'; reasoning = `Promotes a pawn to ${getPieceName(moveResult.promotion)}.`;
      } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
        quality = 'good'; reasoning = 'Castles, improving king safety.';
      } else if ((moveResult.piece === 'n' || moveResult.piece === 'b')) {
        quality = 'good'; reasoning = `Develops the ${getPieceName(moveResult.piece)}.`;
      } else {
         reasoning = `Moves the ${getPieceName(moveResult.piece)}.`;
      }
    } catch (error) { console.error('Error assessing move quality:', error); }
    return { quality, reasoning };
  };

  const makeFallbackMove = () => {
    console.log('Executing smart fallback move...');
    setAiMoveSource('Smart Fallback');
    setGameStatus('AI using fallback strategy...');
    const mutableGame = new Chess(game.fen());
    const legalMoves = mutableGame.moves();
    if (legalMoves.length === 0) {
      setIsPlayerTurn(true); setGameStatus('Your turn (no legal moves for AI)'); return;
    }
    const captureMoves = legalMoves.filter(m => m.includes('x'));
    const checkMoves = legalMoves.filter(m => m.includes('+'));
    const promotionMoves = legalMoves.filter(m => m.includes('='));
    const developingMoves = legalMoves.filter(m => (m.startsWith('N') || m.startsWith('B')) && !m.includes('x'));
    let selectedMove: string;
    let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'fair';
    let thinking = 'Fallback: Basic move selection.';
    if (checkMoves.length > 0) { selectedMove = checkMoves[Math.floor(Math.random() * checkMoves.length)]; quality = 'excellent'; thinking = 'Fallback: Puts king in check.'; }
    else if (captureMoves.length > 0) { selectedMove = captureMoves[Math.floor(Math.random() * captureMoves.length)]; quality = 'good'; thinking = 'Fallback: Captures a piece.'; }
    else if (promotionMoves.length > 0) { selectedMove = promotionMoves[Math.floor(Math.random() * promotionMoves.length)]; quality = 'excellent'; thinking = 'Fallback: Promotes a pawn.'; }
    else if (developingMoves.length > 0) { selectedMove = developingMoves[Math.floor(Math.random() * developingMoves.length)]; quality = 'good'; thinking = 'Fallback: Develops a piece.'; }
    else { selectedMove = legalMoves[Math.floor(Math.random() * legalMoves.length)]; }
    try {
      const moveResult = mutableGame.move(selectedMove);
      if (moveResult) {
        if (moveResult.captured) addCapturedPiece({ type: moveResult.captured, color: moveResult.color === 'w' ? 'b' : 'w' });
        setGame(new Chess(mutableGame.fen())); // Update state immutably
        setIsPlayerTurn(true);
        setLastAIMove(selectedMove);
        setMoveQuality(quality);
        setAiThinking(thinking);
        console.log(`Made smart fallback move: ${selectedMove}`);
      } else throw new Error(`Fallback move ${selectedMove} failed.`);
    } catch (error) {
      console.error('Error making smart fallback move:', error);
      setIsPlayerTurn(true); setGameStatus('Your turn (AI fallback move failed)');
    } finally { setIsLoading(false); }
  };

  // Make getAIMove a regular async function, removing useCallback
  const getAIMove = async () => {
    console.log("getAIMove called. isPlayerTurn:", isPlayerTurn, "Game Over:", game.isGameOver()); // Log entry
    if (game.isGameOver() || isPlayerTurn) { // Check player turn correctly here
        console.log("getAIMove exiting: Game over or not AI's turn.");
        setIsLoading(false); // Ensure loading is stopped if we exit early
        return;
    }
    setIsLoading(true);
    setAiMoveSource(''); setAiThinking(''); setMoveQuality('');
    const currentFen = game.fen();
    const legalMovesForPrompt = game.moves();
    // --- Simplified Prompt ---
    const prompt = `
      Current board FEN: ${currentFen}
      You are playing black.
      Legal moves: ${legalMovesForPrompt.join(', ')}
      Choose the best move from the list.
      CRITICAL: Your entire response must be ONLY the chosen move from the list (e.g., e5 or Nf6 or O-O). No other text or explanation.`;
    // --- End Simplified Prompt ---
    console.log("Using simplified prompt:", prompt); // Log the new prompt
    try {
      console.log('Getting AI move via service...');
      const rawAiMoveText = await fetchRawAIMove(lmStudioUrl, prompt, connectionStatus.modelId);
      console.log('Raw AI response:', rawAiMoveText);
      let aiMoveText = rawAiMoveText.replace(/["'.:,;\n\r]/g, '').split(' ')[0].trim(); // Simple parse: take first word
      console.log('Cleaned AI response:', aiMoveText);

      // Validate the move using a temporary game instance
      const tempGame = new Chess(currentFen);
      let moveResult: Move | null = null;
      try {
        moveResult = tempGame.move(aiMoveText); // Try making the move
      } catch (e) {
         console.log(`Initial move validation failed for "${aiMoveText}", trying variations...`);
         // Attempt variations if direct move fails (e.g., case, missing piece prefix)
         const legalMovesVerbose = new Chess(currentFen).moves({verbose: true});
         const foundMove = legalMovesVerbose.find(m =>
             m.san === aiMoveText ||
             m.san.toLowerCase() === aiMoveText.toLowerCase() ||
             (m.piece.toLowerCase() + m.to === aiMoveText.toLowerCase()) // e.g. Nf3 vs f3
         );
         if (foundMove) {
             aiMoveText = foundMove.san; // Use the correct SAN
             console.log(`Found matching legal move: ${aiMoveText}`);
             try {
                 moveResult = tempGame.move(aiMoveText); // Re-validate with correct SAN
             } catch (revalidationError) {
                 console.error(`Re-validation failed for ${aiMoveText}:`, revalidationError);
                 moveResult = null;
             }
         }
      }

      if (moveResult) {
        console.log('Validated AI move:', aiMoveText);
        setAiMoveSource('LM Studio');
        if (moveResult.captured) addCapturedPiece({ type: moveResult.captured, color: moveResult.color === 'w' ? 'b' : 'w' });
        // Assess quality using the move result and the state *after* the move (tempGame)
        const assessment = assessMoveQuality(moveResult); // Pass the move result
        setMoveQuality(assessment.quality);
        setAiThinking(assessment.reasoning);
        console.log("AI successfully moved:", aiMoveText, "Updating game state."); // Log success
        setGame(new Chess(tempGame.fen())); // Update state immutably
        setIsPlayerTurn(true); // Set turn back to player
        setLastAIMove(aiMoveText);
      } else {
        console.error(`Invalid move from AI: "${rawAiMoveText}" (parsed as "${aiMoveText}")`);
        makeFallbackMove();
      }
    } catch (error) {
      console.error('Error getting AI move:', error);
      setGameStatus('⚠️ ERROR - Using fallback');
      makeFallbackMove();
    } finally {
      setIsLoading(false);
    }
  }; // End getAIMove (no longer useCallback)

  // Trigger AI move
  useEffect(() => {
    // Only trigger if it's AI's turn and game is not over
    if (!isPlayerTurn && !game.isGameOver()) {
      console.log(`AI Turn Triggered: isPlayerTurn=${isPlayerTurn}, FEN=${game.fen()}`); // Add log
      const timer = setTimeout(() => {
        console.log("Calling getAIMove..."); // Add log
        getAIMove(); // Call the function directly
      }, 500); // Small delay for better UX
      return () => clearTimeout(timer);
    }
  // Depend only on isPlayerTurn and fen (which updates when game updates).
  // getAIMove reads current game state internally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerTurn, fen]);

  // --- Player Move Handling ---

  const handlePromotion = (pieceType: PieceSymbol) => {
    if (!promotionMove) return;
    const mutableGame = new Chess(game.fen());
    try {
      const move = mutableGame.move({ from: promotionMove.from, to: promotionMove.to, promotion: pieceType });
      if (move) {
        setGame(new Chess(mutableGame.fen())); // Update state immutably
        setIsPlayerTurn(false);
        setShowPromotionModal(false);
        setPromotionMove(null);
      }
    } catch (error) { console.error('Error during promotion:', error); }
  };

  const isPawnPromotion = (sourceSquare: Square, targetSquare: Square) => {
    const piece = game.get(sourceSquare);
    if (!piece || piece.type !== 'p') return false;
    const targetRank = targetSquare.charAt(1);
    return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
  };

  const onDrop = (sourceSquare: Square, targetSquare: Square): boolean => {
    if (!isPlayerTurn || game.isGameOver()) return false;
    const mutableGame = new Chess(game.fen()); // Create copy to try move
    if (isPawnPromotion(sourceSquare, targetSquare)) {
      setPromotionMove({ from: sourceSquare, to: targetSquare });
      setShowPromotionModal(true);
      return true; // Handled by modal
    }
    try {
      const move = mutableGame.move({ from: sourceSquare, to: targetSquare });
      if (move === null) return false; // Illegal move
      if (move.captured) addCapturedPiece({ type: move.captured, color: move.color === 'w' ? 'b' : 'w' });
      setGame(new Chess(mutableGame.fen())); // Update state immutably
      setIsPlayerTurn(false);
      return true; // Successful move
    } catch (error) {
      console.error("Error making player move:", error);
      return false;
    }
  };

  // --- Game Management Functions ---

  const saveGame = () => {
    const gameName = prompt('Enter a name for this saved game:');
    if (gameName) {
      const newSavedGame = { name: gameName, fen: game.fen(), timestamp: Date.now() };
      const updatedSavedGames = [...savedGames, newSavedGame];
      setSavedGames(updatedSavedGames);
      localStorage.setItem('chessGameSavedGames', JSON.stringify(updatedSavedGames));
      alert(`Game "${gameName}" saved successfully!`);
      setShowSaveLoadModal(false);
    }
  };

  const loadGame = (fenToLoad: string) => {
    try {
      const newGame = new Chess(fenToLoad);
      setGame(newGame);
      setIsPlayerTurn(newGame.turn() === 'w');
      setLastAIMove('');
      setCapturedPieces({ w: [], b: [] });
      setMoveHistory([]);
      setGameStates([newGame.fen()]); // Reset history for loaded game
      setCurrentStateIndex(0);
      setShowSaveLoadModal(false);
    } catch (error) {
      console.error('Error loading game:', error);
      alert('Error loading game. The saved position might be invalid.');
    }
  };

  const deleteSavedGame = (index: number) => {
    if (confirm('Are you sure you want to delete this saved game?')) {
      const updatedSavedGames = [...savedGames];
      updatedSavedGames.splice(index, 1);
      setSavedGames(updatedSavedGames);
      localStorage.setItem('chessGameSavedGames', JSON.stringify(updatedSavedGames));
    }
  };

  const undoMove = () => {
    if (currentStateIndex > 0) {
      const previousIndex = currentStateIndex - 1;
      const previousState = gameStates[previousIndex];
      const previousGame = new Chess(previousState);
      setGame(previousGame);
      setCurrentStateIndex(previousIndex);
      setIsPlayerTurn(previousGame.turn() === 'w');
      // Note: Captured pieces state is not reverted on undo for simplicity
    }
  };

  const redoMove = () => {
    if (currentStateIndex < gameStates.length - 1) {
      const nextIndex = currentStateIndex + 1;
      const nextState = gameStates[nextIndex];
      const nextGame = new Chess(nextState);
      setGame(nextGame);
      setCurrentStateIndex(nextIndex);
      setIsPlayerTurn(nextGame.turn() === 'w');
      // Note: Captured pieces state is not reverted on redo for simplicity
    }
  };

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setIsPlayerTurn(true);
    setLastAIMove('');
    setCapturedPieces({ w: [], b: [] });
    setMoveHistory([]);
    setGameStates([newGame.fen()]);
    setCurrentStateIndex(0);
    setAiMoveSource('');
    setAiThinking('');
    setMoveQuality('');
  };

  // --- Render ---

  return (
    <div className="flex flex-col md:flex-row items-center md:items-start justify-center gap-3 xs:gap-4 sm:gap-5 md:gap-6 w-full max-w-6xl mx-auto">
      {/* Chessboard Area */}
      <div className="flex flex-col items-center w-full md:w-auto">
        <div className="mb-4 w-full max-w-[240px] xs:max-w-[280px] sm:max-w-[350px] md:max-w-[450px] relative">
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation="white"
            boardWidth={450} // This might be overridden by CSS, ensure responsiveness
            id="responsive-chessboard"
            customBoardStyle={{ width: '100%', maxWidth: '100%' }} // Basic responsive style
          />
        </div>
      </div>

      {/* Control Panel Area */}
      <div className="w-full max-w-[240px] xs:max-w-[280px] sm:max-w-[350px] md:w-56 md:mt-0">
        <div className="flex flex-col items-start p-2 rounded-lg shadow-lg bg-gray-800 border border-gray-700 text-white">
          {/* Connection Status */}
          <div className="mb-3 w-full">
            <div className={`p-2 rounded-md border ${connectionStatus.connected ? 'bg-green-900/30 border-green-500' : 'bg-red-900/30 border-red-500'}`}>
              <div className="flex items-center justify-center gap-2">
                <span className={`w-3 h-3 rounded-full ${connectionStatus.connected ? 'bg-green-500' : 'bg-red-500'} ${connectionStatus.connected ? '' : 'animate-pulse'}`}></span>
                <p className="text-sm font-bold">
                  {connectionStatus.connected ? 'LM STUDIO CONNECTED' : 'LM STUDIO DISCONNECTED'}
                </p>
              </div>
              {!connectionStatus.connected && (
                <div className="mt-1 text-xs text-center">
                  <p className="text-gray-300">AI will use fallback strategy</p>
                  {connectionStatus.error && <p className="mt-0.5 text-gray-400 italic text-red-400">Error: {connectionStatus.error}</p>}
                  <p className="mt-0.5 text-gray-400 italic">See console (F12) for setup guide</p>
                </div>
              )}
            </div>
          </div>

          {/* Connected Model */}
          <div className="mt-1 w-full border-t border-gray-700 pt-2">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-gray-300 mb-1">Connected Model:</span>
              <div className="bg-gray-900 p-1.5 rounded-md border border-gray-700 shadow-inner min-h-[28px]">
                <span className="font-mono font-medium text-xs break-all text-blue-300">
                  {connectionStatus.modelId || (connectionStatus.connected ? 'Loading...' : 'None')}
                </span>
              </div>
            </div>
          </div>

          {/* Settings & Reset Buttons */}
          <div className="mt-2 w-full border-t border-gray-700 pt-2 flex gap-1.5">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggleSettings'))}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 border border-gray-600 shadow-sm transition-colors"
            >
              Settings
            </button>
            <button
              onClick={resetGame}
              className="flex-1 px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600 border border-blue-800 shadow-sm transition-colors"
            >
              Reset Game
            </button>
          </div>

          {/* Save/Load & Undo/Redo Buttons */}
          <div className="mt-1.5 w-full flex gap-1.5">
            <button onClick={() => setShowSaveLoadModal(true)} className="flex-1 px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600 border border-green-800 shadow-sm transition-colors" title="Save or load a game">Save/Load</button>
            <button onClick={undoMove} disabled={currentStateIndex <= 0} className={`flex-1 px-2 py-1 text-xs rounded border shadow-sm transition-colors ${currentStateIndex <= 0 ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-amber-700 text-white hover:bg-amber-600 border-amber-800'}`} title="Undo the last move">Undo</button>
            <button onClick={redoMove} disabled={currentStateIndex >= gameStates.length - 1} className={`flex-1 px-2 py-1 text-xs rounded border shadow-sm transition-colors ${currentStateIndex >= gameStates.length - 1 ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-amber-700 text-white hover:bg-amber-600 border-amber-800'}`} title="Redo a previously undone move">Redo</button>
          </div>

          {/* Game Status & AI Info */}
          <div className="mt-2 w-full border-t border-gray-700 pt-2 bg-gray-800 rounded-lg p-1.5 shadow-inner">
            <p className="text-xs font-semibold text-gray-100 text-center">{gameStatus}</p>
            {isLoading && (
              <div className="mt-1 bg-gray-700 rounded-md p-1.5">
                <p className="text-xs text-blue-300 font-medium text-center">AI is thinking...</p>
                {/* Loading animation */}
              </div>
            )}
            {lastAIMove && !isLoading && (
              <div className="mt-1 flex flex-col items-center">
                <p className="text-xs text-gray-300 flex items-center justify-center gap-1.5">
                  <span className="text-gray-400 text-xs">Last move:</span>
                  <span className="font-mono font-bold bg-gray-700 px-1.5 py-0.5 rounded text-blue-300 text-xs">{lastAIMove}</span>
                </p>
                <div className="mt-2 w-full">
                  <div className={`p-2 rounded-md border ${aiMoveSource === 'LM Studio' ? 'bg-green-900/30 border-green-500' : 'bg-amber-900/30 border-amber-500'}`}>
                    <p className="text-center text-sm font-bold">{aiMoveSource === 'LM Studio' ? '✓ AI MOVE: INTELLIGENT (LM Studio)' : '⚠ AI MOVE: FALLBACK STRATEGY'}</p>
                    {moveQuality && <p className="mt-1 text-center text-xs"><span className="text-gray-300">Quality: </span><span className="font-bold">{moveQuality.toUpperCase()}</span></p>}
                    {aiThinking && <p className="mt-1 text-xs text-center italic">{aiThinking}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Move History */}
          <div className="mt-2 w-full border-t border-gray-700 pt-2">
            <h3 className="text-xs font-semibold text-gray-300 mb-1">Move History</h3>
            <div className="bg-gray-800 rounded-md p-1.5 border border-gray-700 max-h-32 overflow-y-auto">
              {moveHistory.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                    const whiteMove = moveHistory[i * 2];
                    const blackMove = moveHistory[i * 2 + 1];
                    return (
                      <React.Fragment key={i}>
                        <div className="flex items-center"><span className="text-xs text-gray-500 w-4">{i + 1}.</span><span className="text-xs font-mono text-white bg-gray-700 px-1 py-0.5 rounded">{whiteMove?.san}</span></div>
                        {blackMove && <div className="flex items-center"><span className="text-xs font-mono text-gray-300 bg-gray-700 px-1 py-0.5 rounded">{blackMove.san}</span></div>}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-gray-500 italic text-center">No moves yet</p>}
            </div>
          </div>

          {/* Captured Pieces */}
          <div className="mt-2 w-full border-t border-gray-700 pt-2">
            <h3 className="text-xs font-semibold text-gray-300 mb-1">Captured Pieces</h3>
            <div className="flex flex-col gap-1.5">
              {/* White captured (Black pieces) */}
              <div className="bg-gray-800 rounded-md p-1.5 border border-gray-700 min-h-[40px]">
                <p className="text-xs text-gray-400 mb-0.5">White captured:</p>
                <div className="flex flex-wrap gap-x-1 gap-y-0.5 items-center">
                  {capturedPieces.b.length === 0 && <p className="text-xs text-gray-500 italic">None</p>}
                  {capturedPieces.b.map((piece) => (
                    <div key={`captured-b-${piece.type}`} className="flex items-center" title={`${getPieceName(piece.type)}`}>
                      <span className="text-base text-gray-300 w-5 h-5 flex items-center justify-center">{getPieceSymbol(piece.type, 'b')}</span>
                      {piece.count > 1 && <span className="text-xs text-gray-400 ml-0.5">x{piece.count}</span>}
                    </div>
                  ))}
                </div>
              </div>
              {/* Black captured (White pieces) */}
              <div className="bg-gray-800 rounded-md p-1.5 border border-gray-700 min-h-[40px]">
                <p className="text-xs text-gray-400 mb-0.5">Black captured:</p>
                <div className="flex flex-wrap gap-x-1 gap-y-0.5 items-center">
                  {capturedPieces.w.length === 0 && <p className="text-xs text-gray-500 italic">None</p>}
                  {capturedPieces.w.map((piece) => (
                    <div key={`captured-w-${piece.type}`} className="flex items-center" title={`${getPieceName(piece.type)}`}>
                      <span className="text-base text-white w-5 h-5 flex items-center justify-center">{getPieceSymbol(piece.type, 'w')}</span>
                      {piece.count > 1 && <span className="text-xs text-gray-400 ml-0.5">x{piece.count}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save/Load Modal */}
      {showSaveLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-md">
            <div className="p-4 border-b border-gray-700"><h3 className="text-lg font-semibold text-gray-100">Save/Load Game</h3></div>
            <div className="p-4">
              <button onClick={saveGame} className="w-full mb-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-600 border border-green-800 shadow-sm transition-colors">Save Current Game</button>
              <h4 className="text-sm font-medium text-gray-300 mb-2">Saved Games</h4>
              {savedGames.length > 0 ? (
                <div className="max-h-60 overflow-y-auto border border-gray-700 rounded-md">
                  {savedGames.map((savedGame, index) => (
                    <div key={savedGame.timestamp} className="p-3 border-b border-gray-700 last:border-b-0 flex justify-between items-center hover:bg-gray-700">
                      <div><p className="text-sm font-medium text-gray-200">{savedGame.name}</p><p className="text-xs text-gray-400">{new Date(savedGame.timestamp).toLocaleString()}</p></div>
                      <div className="flex gap-2">
                        <button onClick={() => loadGame(savedGame.fen)} className="px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600 border border-blue-800 shadow-sm transition-colors">Load</button>
                        <button onClick={() => deleteSavedGame(index)} className="px-2 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-600 border border-red-800 shadow-sm transition-colors">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400 italic text-center p-4 border border-gray-700 rounded-md">No saved games yet</p>}
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end"><button onClick={() => setShowSaveLoadModal(false)} className="px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 border border-gray-600 shadow-sm transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {/* Pawn Promotion Modal */}
      {showPromotionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4 text-center">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Choose Promotion Piece</h3>
            <div className="flex justify-center gap-4">
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(piece => (
                <button key={piece} onClick={() => handlePromotion(piece)} className="w-16 h-16 flex items-center justify-center text-4xl bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600" title={getPieceName(piece)}>
                  {/* Assuming white promotion for simplicity, adjust if black can promote */}
                  {getPieceSymbol(piece, 'w')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
