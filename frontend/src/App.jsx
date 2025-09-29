import { useEffect, useMemo, useState } from 'react'
import './App.css'

const stripTrailingSlash = (value) => value.replace(/\/$/, '')
const ensureLeadingSlash = (value) => (value.startsWith('/') ? value : `/${value}`)

const resolveApiBaseUrl = () => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim()
  if (fromEnv) return stripTrailingSlash(fromEnv)
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5000/api'
    }
    return stripTrailingSlash(`${origin}/api`)
  }
  return '/api'
}

const API_BASE_URL = resolveApiBaseUrl()
const apiUrl = (path) => `${API_BASE_URL}${ensureLeadingSlash(path)}`

const resolveGenerateThemeUrl = () => {
  const fromEnv = import.meta.env.VITE_GENERATE_THEME_URL?.trim()
  if (fromEnv) return stripTrailingSlash(fromEnv)
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5000/generate-theme'
    }
    return `${stripTrailingSlash(origin)}/generate-theme`
  }
  const apiOrigin = stripTrailingSlash(API_BASE_URL.replace(/\/api$/, ''))
  return `${apiOrigin}/generate-theme`
}

const GENERATE_THEME_URL = resolveGenerateThemeUrl()

const defaultCustomItem = { emoji: '❔', name: '', value: '' }

function App() {
  const [templates, setTemplates] = useState([])
  const [player, setPlayer] = useState(null)
  const [gameId, setGameId] = useState('')
  const [gameState, setGameState] = useState(null)
  const [view, setView] = useState('landing')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [bidLocked, setBidLocked] = useState(false)
  const [roundKey, setRoundKey] = useState('')
  const [generateInput, setGenerateInput] = useState('')

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch(apiUrl('/templates'))
        if (!res.ok) throw new Error('Failed to load templates')
        const data = await res.json()
        setTemplates(data.templates || [])
      } catch (error) {
        console.error(error)
        setFeedback('Unable to load item templates right now.')
      }
    }
    loadTemplates()
  }, [])

  useEffect(() => {
    if (!gameId || !player?.id) return undefined

    let cancelled = false

    const fetchState = async () => {
      try {
        const res = await fetch(apiUrl(`/games/${gameId}?playerId=${player.id}`))
        if (!res.ok) throw new Error('Game not found')
        const data = await res.json()
        if (!cancelled) {
          setGameState(data)
          if (data.player) {
            setPlayer((prev) => (prev ? { ...prev, balance: data.player.balance } : prev))
          }
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setFeedback('Lost connection to the game. Retrying...')
      }
    }

    fetchState()
    const interval = setInterval(fetchState, 1800)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gameId, player?.id])

  useEffect(() => {
    const key = `${gameState?.currentIndex ?? 'x'}-${gameState?.roundPhase ?? 'x'}`
    if (key !== roundKey) {
      setBidAmount('')
      setBidLocked(false)
      setRoundKey(key)
    }
  }, [gameState, roundKey])

  useEffect(() => {
    if (!gameState) return
    if (gameState.status === 'in_progress') {
      setView('game')
    } else if (gameState.status === 'completed') {
      setView('results')
    } else {
      setView((prev) => (prev === 'game' || prev === 'results' ? 'lobby' : prev))
    }
  }, [gameState])

  const handleCreateGame = async (hostName, mode, selectedTemplate, customItems) => {
    setBusy(true)
    setFeedback('')
    try {
      const payload = { hostName }
      if (mode === 'template') {
        payload.templateId = selectedTemplate
      } else if (mode === 'generated') {
        payload.items = customItems.map((item) => ({
          emoji: item.emoji || '❔',
          name: item.name,
          value: Number(item.value),
        }))
      } else {
        payload.items = customItems.map((item) => ({
          emoji: item.emoji || '❔',
          name: item.name,
          value: Number(item.value),
        }))
      }
      const res = await fetch(apiUrl('/games'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Unable to create game')
      }
      const data = await res.json()
      setPlayer(data.player)
      setGameId(data.gameId)
      setView('lobby')
      setFeedback('Game created! Share the game ID with friends.')
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoinGame = async (requestedGameId, name) => {
    setBusy(true)
    setFeedback('')
    try {
      const res = await fetch(apiUrl(`/games/${requestedGameId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Unable to join game')
      }
      const data = await res.json()
      setPlayer(data.player)
      setGameId(requestedGameId)
      setView('lobby')
      setFeedback('Waiting for the host to start the game...')
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleStartGame = async () => {
    if (!player?.isHost || !gameId) return
    setBusy(true)
    setFeedback('')
    try {
      const res = await fetch(apiUrl(`/games/${gameId}/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Unable to start game')
      }
      setFeedback('Game started!')
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSubmitBid = async () => {
    if (!gameId || !player?.id || !bidAmount) return
    setBusy(true)
    setFeedback('')
    try {
      const res = await fetch(apiUrl(`/games/${gameId}/bid`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, amount: Number(bidAmount) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Bid rejected')
      }
      setBidLocked(true)
      setFeedback('Bid submitted! Waiting for other players...')
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleNextRound = async () => {
    if (!player?.isHost || !gameId) return
    setBusy(true)
    setFeedback('')
    try {
      const res = await fetch(apiUrl(`/games/${gameId}/next`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Unable to advance round')
      }
    } catch (error) {
      setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  const standings = useMemo(() => {
    if (!gameState?.players) return []
    return [...gameState.players].sort((a, b) => b.balance - a.balance)
  }, [gameState])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Blind Bids </h1>
          <p className="tagline">Outbid the mystery</p>
        </div>
        {gameId && (
          <div className="game-info">
            <span className="label">Game ID</span>
            <span className="value">{gameId}</span>
          </div>
        )}
      </header>

      {feedback && <div className="feedback">{feedback}</div>}

      <main className="content">
        {view === 'landing' && (
          <Landing onCreate={() => setView('create')} onJoin={() => setView('join')} />
        )}

        {view === 'create' && (
          <CreateGameForm
            templates={templates}
            disabled={busy}
            onCancel={() => setView('landing')}
            onCreate={handleCreateGame}
            generateInput={generateInput}
            setGenerateInput={setGenerateInput}
          />
        )}

        {view === 'join' && (
          <JoinGameForm
            disabled={busy}
            onCancel={() => setView('landing')}
            onJoin={handleJoinGame}
          />
        )}

        {view === 'lobby' && gameState && (
          <Lobby
            gameState={gameState}
            player={player}
            busy={busy}
            onStart={handleStartGame}
          />
        )}

        {gameState?.status === 'in_progress' && (
          <GameBoard
            player={player}
            gameState={gameState}
            standings={standings}
            bidAmount={bidAmount}
            setBidAmount={setBidAmount}
            bidLocked={bidLocked}
            onSubmitBid={handleSubmitBid}
            onNextRound={handleNextRound}
            busy={busy}
          />
        )}

        {gameState?.status === 'completed' && (
          <ResultsView gameState={gameState} standings={standings} player={player} />
        )}
      </main>

      <footer className="app-footer">
        <span>All players start with 1000 credits. Spend wisely!</span>
      </footer>
    </div>
  )
}

function Landing({ onCreate, onJoin }) {
  return (
    <div className="panel landing">
      <h2>Ready to play Blind Bids?</h2>
      <p>Host a new game or join an existing one to start bidding on mystery items!</p>
      <div className="cta-group">
        <button className="primary" onClick={onCreate}>
          Host Game
        </button>
        <button className="ghost" onClick={onJoin}>
          Join Game
        </button>
      </div>
    </div>
  )
}

function CreateGameForm({ templates, onCancel, onCreate, disabled, generateInput, setGenerateInput }) {
  const [hostName, setHostName] = useState('')
  const [mode, setMode] = useState('template')
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [customItems, setCustomItems] = useState([{ ...defaultCustomItem }])
  const [generatedTemplate, setGeneratedTemplate] = useState(null)
  const [aiMessage, setAiMessage] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => {
    if (!templateId && templates.length) {
      setTemplateId(templates[0].id)
    }
  }, [templates, templateId])

  const generatedItems = useMemo(() => {
    if (!generatedTemplate?.items) return []
    return generatedTemplate.items
  }, [generatedTemplate])

  const requestGeneratedTemplate = async (label = 'Generating') => {
    if (!generateInput.trim()) return
    setAiBusy(true)
    setAiMessage(`🎲 ${label} items...`)
    try {
      const res = await fetch(GENERATE_THEME_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: generateInput, prompt: generateInput }),
      })
      if (!res.ok) throw new Error('Failed to generate items')
      const data = await res.json()
      const rawTemplate = (() => {
        if (data.template) {
          return typeof data.template === 'string' ? JSON.parse(data.template) : data.template
        }
        return data
      })()
      if (!rawTemplate || !Array.isArray(rawTemplate.items)) {
        throw new Error('Invalid AI response')
      }
      const normalised = {
        ...rawTemplate,
        items: rawTemplate.items.map((item, index) => ({
          emoji: item.emoji || '❔',
          name: item.name || `Item ${index + 1}`,
          value: Number(item.value) || 0,
        })),
      }
      setGeneratedTemplate(normalised)
      setAiMessage('✅ Items ready! Review them below.')
    } catch (error) {
      console.error(error)
      setGeneratedTemplate(null)
      setAiMessage('❌ Unable to generate items right now. Please try again.')
    } finally {
      setAiBusy(false)
    }
  }

  const updateCustomItem = (index, key, value) => {
    setCustomItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)))
  }

  const addCustomItem = () => {
    setCustomItems((prev) => [...prev, { ...defaultCustomItem }])
  }

  const removeCustomItem = (index) => {
    setCustomItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!hostName.trim()) return
    if (mode === 'template' && !templateId) return
    if (mode === 'generated' && (!generatedItems || generatedItems.length === 0)) return
    if (mode === 'custom') {
      const filtered = customItems.filter((item) => item.name && item.value)
      if (!filtered.length) return
      onCreate(hostName.trim(), mode, templateId, filtered)
    } else if (mode === 'generated') {
      onCreate(hostName.trim(), mode, templateId, generatedItems)
    } else {
      onCreate(hostName.trim(), mode, templateId, customItems)
    }
  }

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <h2>Create Game</h2>
      <label>
        Host name
        <input
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
          placeholder="Enter your name"
          required
        />
      </label>

      <div className="mode-toggle">
        <button
          type="button"
          className={mode === 'template' ? 'active' : ''}
          onClick={() => setMode('template')}
        >
          Use Template
        </button>

        {/* AI Generated Items */}
        <button type="button" 
        className={mode === 'generated' ? 'active' : ''}
        onClick={() => setMode('generated')}>
          AI Generated Items
        </button>

        <button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
          Custom Items
        </button>
      </div>

      {mode === 'template' ? (
        <div className="template-grid">
          {templates.map((template) => (
            <label key={template.id} className={templateId === template.id ? 'template-card selected' : 'template-card'}>
              <input
                type="radio"
                name="template"
                value={template.id}
                checked={templateId === template.id}
                onChange={(event) => setTemplateId(event.target.value)}
              />
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <div className="chips">
                {template.items.map((item) => (
                  <span key={item.name} className="chip">
                    {item.emoji} {item.name}
                  </span>
                ))}
              </div>
            </label>
          ))}
        </div>
      ) : mode === 'generated' ? (
        <div className="ai-generated-section">
          <div className="ai-input-section">
            <h3>🤖 AI Item Generator</h3>
            <p className="description">Describe your theme and let AI create unique auction items for you!</p>
            
            <div className="input-group">
              <input
                type="text"
                value={generateInput}
                onChange={(e) => setGenerateInput(e.target.value)}
                placeholder="e.g., #7 'spooky haunted mansion items' or 'futuristic space gadgets and'"
                className="ai-input"
              />
              <button
                type="button"
                className={`generate-btn ${!generateInput.trim() || aiBusy ? 'disabled' : ''}`}
                onClick={() => requestGeneratedTemplate('Generating unique')}
                disabled={!generateInput.trim() || aiBusy}
              >
                {aiBusy ? (
                  <>
                    <span className="spinner">⟳</span> Generating...
                  </>
                ) : (
                  <>🎯 Generate Items</>
                )}
              </button>
            </div>

            {aiMessage && (
              <div
                className={`ai-feedback ${
                  aiBusy
                    ? 'loading'
                    : aiMessage.startsWith('❌')
                      ? 'error'
                      : 'success'
                }`}
              >
                {aiMessage}
              </div>
            )}
          </div>

          {generatedTemplate && generatedItems.length > 0 && (
            <div className="generated-items-display">
              <div className="display-header">
                <div>
                  <h4>✨ {generatedTemplate.name || 'Generated Items'} ({generatedItems.length})</h4>
                  {generatedTemplate.description && <p className="generated-description">{generatedTemplate.description}</p>}
                </div>
                <button
                  type="button"
                  className="regenerate-btn"
                  onClick={() => requestGeneratedTemplate('Regenerating')}
                  disabled={aiBusy || !generateInput.trim()}
                >
                  🔄 Regenerate
                </button>
              </div>
              
              <div className="items-grid">
                {generatedItems.map((item, idx) => (
                  <div key={idx} className="generated-item-card">
                    <div className="item-emoji">{item.emoji || '❔'}</div>
                    <div className="item-details">
                      <div className="item-name">{item.name}</div>
                      <div className="item-value">{item.value} credits</div>
                    </div>
                    <div className="item-index">#{idx + 1}</div>
                  </div>
                ))}
              </div>
              
              <div className="generation-summary">
                <p className="summary-text">
                  🎊 Perfect! These {generatedItems.length} items are ready for your auction game.
                </p>
              </div>
            </div>
          )}
          
          {(!generatedItems || generatedItems.length === 0) && (
            <div className="empty-state">
              <div className="empty-icon">🎭</div>
              <p>Enter a theme above to generate unique auction items!</p>
              <div className="example-themes">
                <span className="example-tag" onClick={() => setGenerateInput('medieval fantasy items')}>
                  🏰 Medieval Fantasy
                </span>
                <span className="example-tag" onClick={() => setGenerateInput('retro arcade items')}>
                  🕹️ Retro Arcade
                </span>
                <span className="example-tag" onClick={() => setGenerateInput('underwater treasures')}>
                  🌊 Ocean Treasures
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="custom-items">
          {customItems.map((item, index) => (
            <div key={index} className="custom-row">
              <input
                className="emoji"
                maxLength={2}
                value={item.emoji}
                onChange={(event) => updateCustomItem(index, 'emoji', event.target.value)}
                placeholder="🎁"
              />
              <input
                className="name"
                value={item.name}
                onChange={(event) => updateCustomItem(index, 'name', event.target.value)}
                placeholder="Some weird item"
                required
              />
              <input
                className="value"
                type="number"
                min="0"
                value={item.value}
                onChange={(event) => updateCustomItem(index, 'value', event.target.value)}
                placeholder="250"
                required
              />
              {customItems.length > 1 && (
                <button type="button" className="ghost" onClick={() => removeCustomItem(index)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="ghost" onClick={addCustomItem}>
            Add Item
          </button>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={disabled}>
          Back
        </button>
        <button 
          className="primary" 
          type="submit" 
          disabled={disabled || (mode === 'generated' && (!generatedItems || generatedItems.length === 0))}
        >
          {mode === 'generated' && (!generatedItems || generatedItems.length === 0) 
            ? 'Generate Items First' 
            : disabled 
              ? 'Creating...' 
              : 'Create Game'
          }
        </button>
      </div>
    </form>
  )
}

function JoinGameForm({ onJoin, onCancel, disabled }) {
  const [gameCode, setGameCode] = useState('')
  const [name, setName] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!gameCode.trim() || !name.trim()) return
    onJoin(gameCode.trim().toUpperCase(), name.trim())
  }

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <h2>Join Game</h2>
      <label>
        Game ID
        <input
          value={gameCode}
          onChange={(event) => setGameCode(event.target.value)}
          placeholder="ABC123"
          required
        />
      </label>
      <label>
        Your name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={disabled}>
          Back
        </button>
        <button className="primary" type="submit" disabled={disabled}>
          Join
        </button>
      </div>
    </form>
  )
}

function Lobby({ gameState, player, busy, onStart }) {
  return (
    <div className="panel lobby">
      <h2>Lobby</h2>
      <p className="lobby-sub">Share the game ID with friends so they can join.</p>
      <div className="players-list">
        {gameState.players.map((entry) => (
          <div key={entry.id} className="player-card">
            <div className="avatar">{entry.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h3>
                {entry.name} {entry.isHost && <span className="tag">Host</span>}
              </h3>
              <p>{entry.balance} credits</p>
            </div>
          </div>
        ))}
      </div>
      {player?.isHost ? (
        <button className="primary" onClick={onStart} disabled={busy || gameState.players.length < 1}>
          Start Game
        </button>
      ) : (
        <p className="small">Waiting for the host to start...</p>
      )}
    </div>
  )
}

function GameBoard({
  player,
  gameState,
  standings,
  bidAmount,
  setBidAmount,
  bidLocked,
  onSubmitBid,
  onNextRound,
  busy,
}) {
  const phase = gameState.roundPhase
  const currentItem = gameState.currentItem
  const canBid = phase === 'bidding' && !bidLocked
  const reveal = phase === 'reveal'

  return (
    <div className="board">
      <section className="left">
        <div className={`item-card ${phase}`}>
          {currentItem && (
            <>
              <div className="item-emoji">{currentItem.emoji}</div>
              <h2 className="item-name">{currentItem.name}</h2>
              <p className="item-meta">
                Item {currentItem.index + 1} of {gameState.totalItems}
              </p>
            </>
          )}
        </div>

        {phase === 'bidding' && (
          <div className="bid-panel">
            <h3>Your Bid</h3>
            <p className="balance">Balance: {player?.balance ?? 0} credits</p>
            <div className="bid-input">
              <input
                type="number"
                min="0"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                disabled={!canBid || busy}
                placeholder="Enter your bid"
              />
              <button className="primary" onClick={onSubmitBid} disabled={!canBid || busy || !bidAmount}>
                Submit Bid
              </button>
            </div>
            {bidLocked && <p className="small">Bid locked in. Waiting for other players...</p>}
          </div>
        )}

        {reveal && gameState.roundSummary && player?.isHost && (
          <div className="reveal-card">
            <h3>Round Results</h3>
            <div className="reveal-item">
              <span className="emoji">{gameState.roundSummary.item.emoji}</span>
              <div>
                <h4>{gameState.roundSummary.item.name}</h4>
                <p>Actual value: {gameState.roundSummary.item.value}</p>
              </div>
            </div>
            <p>
              Winner: <strong>{gameState.roundSummary.winner.name}</strong> with a bid of{' '}
              <strong>{gameState.roundSummary.winningBid}</strong>
            </p>
            <p>
              Net gain: <strong>{gameState.roundSummary.netGain}</strong> credits
            </p>
            <button className="primary" onClick={onNextRound} disabled={busy}>
              {gameState.currentIndex + 1 === gameState.totalItems ? 'Finish Game' : 'Next Item'}
            </button>
          </div>
        )}

        {reveal && !player?.isHost && <p className="small">Waiting for the host to reveal results...</p>}
      </section>

      <section className="right">
        <Scoreboard standings={standings} currentPlayerId={player?.id} />
        <History history={gameState.history} isHost={player?.isHost} />
      </section>
    </div>
  )
}

function Scoreboard({ standings, currentPlayerId }) {
  return (
    <div className="scoreboard">
      <h3>Leaderboard</h3>
      <ul>
        {standings.map((entry, index) => (
          <li key={entry.id} className={entry.id === currentPlayerId ? 'self' : ''}>
            <span className="rank">#{index + 1}</span>
            <span className="name">{entry.name}</span>
            <span className="balance">{entry.balance}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function History({ history, isHost }) {
  if (!history.length) {
    return (
      <div className="history">
        <h3>Reveal Log</h3>
        <p className="small">Round results will appear here once revealed.</p>
      </div>
    )
  }

  return (
    <div className="history">
      <h3>Reveal Log</h3>
      <ul>
        {history
          .slice()
          .reverse()
          .map((entry) => (
            <li key={`${entry.roundIndex}-${entry.timestamp}`}>
              <div className="item">
                <span className="emoji">{entry.item.emoji}</span>
                <div>
                  <strong>{entry.item.name}</strong>
                  <p>
                    Value {entry.item.value} · Winner {entry.winner.name} · Bid {entry.winningBid}
                  </p>
                </div>
              </div>
            </li>
          ))}
      </ul>
      {!isHost && <p className="small">Results appear after the host reveals them.</p>}
    </div>
  )
}

function ResultsView({ gameState, standings, player }) {
  return (
    <div className="panel results">
      <h2>Final Results</h2>
      {gameState.results?.winner && (
        <div className="winner-card">
          <span className="crown">👑</span>
          <div>
            <h3>{gameState.results.winner.name}</h3>
            <p>Champion with {gameState.results.winner.balance} credits!</p>
          </div>
        </div>
      )}
      <ol className="final-standings">
        {standings.map((entry) => (
          <li key={entry.id} className={entry.id === player?.id ? 'self' : ''}>
            <span className="name">{entry.name}</span>
            <span className="balance">{entry.balance}</span>
          </li>
        ))}
      </ol>
      {player?.isHost && (
        <p className="small">Refresh the page to host another game.</p>
      )}
    </div>
  )
}

export default App
