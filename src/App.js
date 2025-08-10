/**
 * Solana Wallet Balance Checker & USDT Minter
 * 
 * This React application demonstrates:
 * - Connecting to Solana wallets (Phantom, Solflare, etc.)
 * - Checking SOL and USDT balances on localhost
 * - Creating and minting custom USDT tokens on local test validator
 * 
 * Prerequisites:
 * - Local Solana test validator running on localhost:8899
 * - Solana wallet extension installed (Phantom recommended)
 * - Wallet configured to use localhost network
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Buffer } from 'buffer';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import {
  getAccount,
  getAssociatedTokenAddress,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo
} from '@solana/spl-token';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  WalletMultiButton,
  WalletDisconnectButton,
} from '@solana/wallet-adapter-react-ui';
import './App.css';

// Import wallet adapter CSS for styled wallet buttons
require('@solana/wallet-adapter-react-ui/styles.css');

// Make Buffer available globally for Solana libraries (browser compatibility)
window.Buffer = Buffer;

/**
 * WalletContent Component
 * 
 * Main component that handles wallet interactions, balance checking, and USDT minting.
 * Uses the Solana wallet adapter context to access connected wallet information.
 */
function WalletContent() {
  // Wallet adapter hooks - provides access to connected wallet
  const { publicKey, connected } = useWallet();
  
  // State management for application data
  const [connection, setConnection] = useState(null);           // Solana RPC connection
  const [solBalance, setSolBalance] = useState(null);           // SOL balance in SOL units
  const [usdtBalance, setUsdtBalance] = useState(null);         // USDT balance in USDT units
  const [loading, setLoading] = useState(false);               // Loading state for balance fetching
  const [error, setError] = useState('');                      // Error messages
  const [usdtMintAddress, setUsdtMintAddress] = useState(null); // Address of created USDT mint
  const [minting, setMinting] = useState(false);               // Loading state for minting process

  /**
   * Initialize connection to local Solana test validator
   * Sets up error handling for MetaMask interference
   */
  useEffect(() => {
    // Create connection to local test validator
    const conn = new Connection('http://localhost:8899', 'confirmed');
    setConnection(conn);
  }, []);

  /**
   * Auto-fetch balances when wallet connects
   * Triggers balance refresh whenever wallet connection state changes
   */
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalances();
    }
  }, [connected, publicKey]);

  /**
   * Fetch SOL and USDT balances for the connected wallet
   * 
   * Process:
   * 1. Get SOL balance from the blockchain
   * 2. Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
   * 3. Try to get USDT balance from associated token account
   * 4. Handle cases where USDT account doesn't exist yet
   */
  const fetchBalances = async () => {
    if (!connection || !publicKey) return;

    setLoading(true);
    setError('');

    try {
      // Fetch SOL balance in lamports (smallest unit)
      const solBalanceLamports = await connection.getBalance(publicKey);
      console.log('Wallet address being checked:', publicKey.toString());
      console.log('Raw balance from getBalance():', solBalanceLamports);

      // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
      const solBalanceSOL = solBalanceLamports / LAMPORTS_PER_SOL;
      console.log('SOL balance:', solBalanceSOL);
      setSolBalance(solBalanceSOL);

      // Attempt to fetch USDT balance
      try {
        // Use locally created USDT mint if available
        if (usdtMintAddress) {
          const mintToUse = new PublicKey(usdtMintAddress);

          // Get the associated token account address for this wallet and mint
          const usdtTokenAccount = await getAssociatedTokenAddress(
            mintToUse,
            publicKey
          );

          // Fetch the token account data
          const accountInfo = await getAccount(connection, usdtTokenAccount);
          const usdtBalanceRaw = Number(accountInfo.amount);
          
          // Convert raw token amount to USDT (6 decimal places)
          const usdtBalanceFormatted = usdtBalanceRaw / Math.pow(10, 6);
          setUsdtBalance(usdtBalanceFormatted);
        } else {
          // No USDT mint created yet
          setUsdtBalance(0);
        }
      } catch (usdtError) {
        console.log('USDT account not found or error:', usdtError.message);
        setUsdtBalance(0);
      }

    } catch (err) {
      setError(`Error fetching balances: ${err.message}`);
      console.error('Balance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Mint 1000 USDT tokens to the connected wallet
   * 
   * This function demonstrates the complete process of:
   * 1. Creating a new token mint (USDT)
   * 2. Creating an associated token account for the wallet
   * 3. Minting tokens to that account
   * 
   * Note: This creates a NEW USDT mint each time for demonstration purposes.
   * In production, you would typically use an existing mint.
   */
  const mintUSDT = async () => {
    // Validation checks
    if (!publicKey) {
      alert('Please connect your wallet first!');
      return;
    }

    if (!connection) {
      alert('Connection not established!');
      return;
    }

    setMinting(true);
    setError('');

    try {
      console.log('=== Starting USDT Minting Process ===');
      console.log('Connected wallet:', publicKey.toString());

      // Step 1: [Local Test] Create mint authority keypair
      // This keypair will have authority to create the mint and mint tokens
      const mintAuthority = Keypair.generate();
      console.log('Mint authority created:', mintAuthority.publicKey.toString());

      // Verify connection to validator
      try {
        const slot = await connection.getSlot();
        console.log('Current validator slot:', slot);
      } catch (connectionError) {
        throw new Error(`Cannot connect to validator: ${connectionError.message}`);
      }

      // Step 2: [Local Test] Fund the mint authority with SOL for transaction fees
      console.log('Step 1: Airdropping SOL to mint authority...');
      try {
        const airdropSignature = await connection.requestAirdrop(
          mintAuthority.publicKey, 
          LAMPORTS_PER_SOL // Request 1 SOL
        );
        console.log('Airdrop signature:', airdropSignature);

        // Wait for airdrop transaction to be confirmed
        console.log('Waiting for airdrop confirmation...');
        await connection.confirmTransaction(airdropSignature);

        // Verify the mint authority received SOL
        const mintAuthorityBalance = await connection.getBalance(mintAuthority.publicKey);
        console.log('Mint authority balance:', mintAuthorityBalance / LAMPORTS_PER_SOL, 'SOL');

        if (mintAuthorityBalance === 0) {
          throw new Error('Airdrop failed - mint authority has no SOL');
        }
      } catch (airdropError) {
        throw new Error(`Airdrop failed: ${airdropError.message}`);
      }

      // Step 3: [Local Test] Create the USDT token mint
      // Use official mint address for mainnet
      console.log('Step 2: Creating USDT mint...');
      let mint;
      try {
        mint = await createMint(
          connection,
          mintAuthority,                    // Payer (pays transaction fees)
          mintAuthority.publicKey,          // Mint authority (can mint tokens)
          null,                            // Freeze authority (can freeze accounts)
          6                                // Decimals (USDT uses 6 decimal places)
        );
        console.log('USDT Mint created successfully:', mint.toBase58());
        setUsdtMintAddress(mint.toBase58());
      } catch (mintError) {
        throw new Error(`Failed to create mint: ${mintError.message}`);
      }

      // Step 4: Create associated token account for the connected wallet
      console.log('Step 3: Creating associated token account...');
      let associatedTokenAccount;
      try {
        associatedTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          mintAuthority,    // Payer (pays transaction fees)
          mint,            // Token mint
          publicKey        // Owner of the token account (connected wallet)
        );
        console.log('Associated Token Account created:', associatedTokenAccount.address.toBase58());
      } catch (ataError) {
        throw new Error(`Failed to create associated token account: ${ataError.message}`);
      }

      // Step 5: Mint 1000 USDT tokens to the wallet's token account
      console.log('Step 4: Minting 1000 USDT...');
      const amountToMint = 1000 * (10 ** 6); // 1000 USDT with 6 decimals = 1,000,000,000
      console.log('Amount to mint (raw):', amountToMint);

      try {
        const mintSignature = await mintTo(
          connection,
          mintAuthority,                    // Payer (pays transaction fees)
          mint,                            // Token mint
          associatedTokenAccount.address,   // Destination token account
          mintAuthority,                    // Mint authority (authorizes minting)
          amountToMint                     // Amount to mint (in smallest units)
        );
        console.log('Mint signature:', mintSignature);

        // Wait for mint transaction to be confirmed
        await connection.confirmTransaction(mintSignature);
        console.log('Mint transaction confirmed');
      } catch (mintToError) {
        throw new Error(`Failed to mint tokens: ${mintToError.message}`);
      }

      console.log('=== USDT Minting Completed Successfully ===');
      alert('Successfully minted 1000 USDT!');

      // Refresh balances to show the new USDT tokens
      fetchBalances();

    } catch (error) {
      console.error('=== USDT Minting Failed ===');
      console.error('Full error:', error);
      console.error('Error stack:', error.stack);

      const errorMessage = error.message || 'Unknown error occurred';
      setError(`USDT minting failed: ${errorMessage}`);
      alert(`USDT minting failed: ${errorMessage}\n\nCheck console for full details.`);
    } finally {
      setMinting(false);
    }
  };

  // Render the main application UI
  return (
    <div className="App">
      <header className="App-header">
        <h1>Solana Wallet Balance Checker</h1>
        <p>Connected to: Local Test Validator (localhost:8899)</p>

        {/* Wallet Connection Section */}
        <div style={{ margin: '20px 0' }}>
          <WalletMultiButton style={{ marginRight: '10px' }} />
          {connected && <WalletDisconnectButton />}
        </div>

        {/* Error Display */}
        {error && (
          <div style={{ color: '#ff6b6b', margin: '10px 0' }}>
            {error}
          </div>
        )}

        {/* Wallet Information and Controls (shown when wallet is connected) */}
        {connected && publicKey && (
          <div style={{
            backgroundColor: '#282c34',
            padding: '20px',
            borderRadius: '10px',
            margin: '20px 0',
            border: '1px solid #61dafb'
          }}>
            <h2>Wallet Balances</h2>
            <div style={{ textAlign: 'left' }}>
              <p><strong>Address:</strong> {publicKey.toString()}</p>
              <p><strong>SOL Balance:</strong> {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : 'Loading...'}</p>
              <p><strong>USDT Balance:</strong> {usdtBalance !== null ? `${usdtBalance.toFixed(2)} USDT` : 'Loading...'}</p>
              {usdtMintAddress && (
                <p><strong>USDT Mint:</strong> {usdtMintAddress}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: '15px' }}>
              <button
                onClick={mintUSDT}
                disabled={minting || !connected}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                {minting ? 'Minting...' : 'Mint 1000 USDT'}
              </button>

              <button
                onClick={fetchBalances}
                disabled={loading || !connected}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                {loading ? 'Refreshing...' : 'Refresh Balances'}
              </button>
            </div>
          </div>
        )}

        {/* Instructions (shown when wallet is not connected) */}
        {!connected && (
          <div style={{ margin: '20px 0', padding: '20px', backgroundColor: '#333', borderRadius: '10px' }}>
            <p>Please connect your Solana wallet to view balances and mint USDT.</p>
            <p>Make sure you have Phantom, Solflare, or another Solana wallet installed.</p>
          </div>
        )}

        {/* Setup Instructions */}
        <div style={{ marginTop: '30px', fontSize: '14px', opacity: 0.8 }}>
          <p>💡 Setup Instructions:</p>
          <ul style={{ textAlign: 'left', maxWidth: '500px' }}>
            <li>Start local test validator: <code>solana-test-validator</code></li>
            <li>Install Phantom or Solflare wallet extension</li>
            <li>Configure wallet to use localhost network (http://localhost:8899)</li>
            <li>Get test SOL: <code>solana airdrop 2</code></li>
            <li>Connect wallet and mint USDT tokens for testing</li>
          </ul>
        </div>
      </header>
    </div>
  );
}

/**
 * Main App Component
 * 
 * Sets up the Solana wallet adapter providers that enable wallet connectivity.
 * Uses the Wallet Standard for automatic detection of installed wallets.
 */
function App() {
  // Local test validator endpoint
  const endpoint = 'http://localhost:8899';

  // Empty wallet array - all wallets are auto-detected via Wallet Standard
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;