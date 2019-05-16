let provider, web3, isValidBase58Input;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

$(function() {
  $('#EDGEWARE_BASE58_ADDRESS').on('blur', function(e) {
    isValidBase58Input = validateBase58Input(e.target.value);
    if (e.target.value !== '' && !isValidBase58Input) {
      alert('Please enter a valid base58 edgeware public address!');
    }
  });
  $('input[name="locktime"]').change(function(e) {
    var val = $('input[name="locktime"]:checked').val();
    if (val === 'signal') {
      $('.body-container').removeClass('locking');
      $('.body-container').addClass('signaling');
    } else if (val.startsWith('lock')) {
      $('.body-container').addClass('locking');
      $('.body-container').removeClass('signaling');
    } else {
      $('.body-container').removeClass('locking');
      $('.body-container').removeClass('signaling');
    }
  });

  $('button.metamask').click(async function() {
    if (!isValidBase58Input) {
      alert('Please enter a valid base58 edgeware public address!');
      return;
    } else {
      $('.participation-option').hide();
      $('.participation-option.metamask').slideDown(100);
      // Setup ethereum connection and web3 provider
      await enableMetamaskEthereumConnection();
      setupMetamaskWeb3Provider();
      // Grab form data
      let { returnTransaction, params, failure, reason } = await configureTransaction(true);
      if (failure) alert(reason);
      // Send transaction if successfully configured transaction
      returnTransaction.send(params, function(err, txHash) {
        if (err) {
          // Do something with errors
          console.log(err);
        } else {
          // Do something with results
          console.log(txHash);
        }
      });
    }
  });
  $('button.mycrypto').click(async function() {
    if (!isValidBase58Input) {
      alert('Please enter a valid base58 edgeware public address!');
      return;
    } else {
      $('.participation-option').hide();
      $('.participation-option.mycrypto').slideDown(100);
      // Setup INFURA web3 provider
      setupInfuraWeb3Provider();
      // Grab form data
      let { returnTransaction, failure, reason } = await configureTransaction(false);
      // Check for failure in cases of signaling for MyCrypto
      if (failure) {
        alert(reason);
      } else {
        txData = returnTransaction.encodeABI();
        $('#LOCKDROP_TX_DATA').text(txData);
      }
    }
  });
  $('button.cli').click(function() {
    if (!isValidBase58Input) {
      alert('Please enter a valid base58 edgeware public address!');
      return;
    }
    $('.participation-option').hide();
    $('.participation-option.cli').slideDown(100);
    let lockdropContractAddress = $('#LOCKDROP_CONTRACT_ADDRESS').val();
    let edgewareBase58Address = $('#EDGEWARE_BASE58_ADDRESS').val();
    const dotenv = `# ETH config
ETH_PRIVATE_KEY=<ENTER_YOUR_PRIVATE_KEY_HEX_HERE>

# Node/provider config
INFURA_PATH=v3/<INSERT_INFURA_API_KEY_HERE>

# Lockdrop config
LOCKDROP_CONTRACT_ADDRESS=${lockdropContractAddress}

# Edgeware config
EDGEWARE_PUBLIC_ADDRESS=${edgewareBase58Address}`;
    $('#LOCKDROP_DOTENV').text(dotenv);
  });

  $('button.commonwealth-ui').click(function() {
    $('.generate-option').hide();
    $('.generate-option.commonwealth-ui').slideDown(100);
  });

  $('button.rust').click(function() {
    $('.generate-option').hide();
    $('.generate-option.rust').slideDown(100);
  });
});

async function configureTransaction(isMetamask) {
  let failure = false;
  let returnTransaction, params, reason;

  let lockdropContractAddress = $('#LOCKDROP_CONTRACT_ADDRESS').val();
  let edgewareBase58Address = $('#EDGEWARE_BASE58_ADDRESS').val();
  let ethLockAmount = $('#ETH_LOCK_AMOUNT').val();
  let lockdropLocktimeFormValue = $('input[name=locktime]:checked').val();
  let validatorIntent = $('input[name=validator]:checked').val();

  if (isNaN(+ethLockAmount) || +ethLockAmount <= 0) {
    alert('Please enter a valid ETH amount!');
    return;
  }

  // Encode Edgeware address in hex for Ethereum transactions
  const encodedEdgewareAddress = '0x' + toHexString(fromB58(edgewareBase58Address));
  // Grab lockdrop JSON and instantiate contract
  const json = await $.getJSON('Lockdrop.json');
  const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
  // Switch on transaction type
  const signaling = (lockdropLocktimeFormValue === 'signal');
  if (!signaling) {
    // Calculate lock term as enum values
    const lockdropLocktime = (lockdropLocktimeFormValue === 'lock3')
    ? 0 : (lockdropLocktimeFormValue === 'lock6')
      ? 1 : 2;

    // Params are only needed for sending transactions directly i.e. from Metamask
    if (isMetamask) {
      const coinbaseAcct = await web3.eth.getCoinbase();
      params = {
        from: coinbaseAcct,
        value: web3.utils.toWei(ethLockAmount, 'ether'),
      };
    }
    returnTransaction = contract.methods.lock(lockdropLocktime, encodedEdgewareAddress, validatorIntent);
  } else {
    if (isMetamask) {
      const coinbaseAcct = await web3.eth.getCoinbase();
      params = { from: coinbaseAcct };
    }

    // FIXME: Create these inputs for signalers
    let signalingContractAddress = $('#SIGNALING_CONTRACT_ADDR').val();
    let signalingContractNonce = $('#SIGNALING_CONTRACT_NONCE').val();

    let res = validateContractAddress(signalingContractAddress, signalingContractNonce);
    if (!isMetamask && res.failure) {
      console.log(isMetamask);
      return res;
    } else {
      signalingContractAddress = signalingContractAddress || params.from;
      signalingContractNonce = signalingContractNonce || 0;
    }

    returnTransaction = contract.methods.signal(signalingContractAddress, signalingContractNonce, encodedEdgewareAddress);
  }
  return { returnTransaction, params, failure, reason };
}

/**
 * Ensure that the input is a formed correctly
 * @param {String} input
 */
function validateBase58Input(input) {
  // Keys should be formatted as '5GYyKi34emBk54Tf6t3xRgq71x8jRVLykaQqwkJKP76pGwry'
  if (input.length != 48) return false;

  for (inx in input) {
    if (BASE58_ALPHABET.indexOf(input[inx]) == -1) {
      return false;
    }
  }
  return true;
}

/**
 * Ensure that the contract address and nonce are properly formatted
 * @param {String} input
 */
function validateContractAddress(contractAddress, nonce) {
  if (!contractAddress || !nonce) {
    return {
      failure: true,
      reason: 'No signaling contract or nonce provided for generating tx data',
    };
  }

  if (isNaN(nonce)) {
    return {
      failure: true,
      reason: 'Nonce must be an integer',
    };
  }

  if (contractAddress.indexOf('0x') > 0 && contractAddress.length !== 42) {
    return {
      failure: true,
      reason: 'Contract address is not valid, it contains 0x but must by 20 bytes in length',
    };
  }

  if (contractAddress.indexOf('0x') === -1 && contractAddress.length !== 40) {
    return {
      failure: true,
      reason: 'Contract address is not valid, it does not contain 0x nor is it 20 bytes',
    };
  }

  return { failure: false };
}

/**
 * Setup web3 provider using Metamask's injected providers
 */
function setupMetamaskWeb3Provider() {
  // Setup web3 provider
  if (typeof window.ethereum !== 'undefined' || (typeof window.web3 !== 'undefined')) {
    // Web3 browser user detected. You can now use the provider.
    provider = window['ethereum'] || window.web3.currentProvider
  }

  web3 = new window.Web3(provider);
}

/**
 * Setup web3 provider using Infura Public Gateway
 */
function setupInfuraWeb3Provider() {
  if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
  } else {
    // Set the provider you want from Web3.providers
    web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'));
  }
}

/**
 * Enable connection between browser and Metamask
 */
async function enableMetamaskEthereumConnection() {
  try {
    await ethereum.enable()
  } catch (error) {
    // Handle error. Likely the user rejected the login:
    console.log(reason === 'User rejected provider access')
  }
}

/**
 * Encodes a Uint8Array (byte array) into a hex string
 * @param {Uint8Array} bytes to convert to hex
 */
function toHexString(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

/**
 * Decode a base58 string into a Uint8Array (byte array)
 * @param {String} input to decode
 */
function fromB58(input) {
  var d = [],   //the array for storing the stream of decoded bytes
      b = [],   //the result byte array that will be returned
      i,        //the iterator variable for the base58 string
      j,        //the iterator variable for the byte array (d)
      c,        //the carry amount variable that is used to overflow from the current byte to the next byte
      n;        //a temporary placeholder variable for the current byte
  for(i in input) { //loop through each base58 character in the input string
      j = 0,                             //reset the byte iterator
      c = BASE58_ALPHABET.indexOf( input[i] );             //set the initial carry amount equal to the current base58 digit
      if(c < 0)                          //see if the base58 digit lookup is invalid (-1)
          return undefined;              //if invalid base58 digit, bail out and return undefined
      c || b.length ^ i ? i : b.push(0); //prepend the result array with a zero if the base58 digit is zero and non-zero characters haven't been seen yet (to ensure correct decode length)
      while(j in d || c) {               //start looping through the bytes until there are no more bytes and no carry amount
          n = d[j];                      //set the placeholder for the current byte
          n = n ? n * 58 + c : c;        //shift the current byte 58 units and add the carry amount (or just add the carry amount if this is a new byte)
          c = n >> 8;                    //find the new carry amount (1-byte shift of current byte value)
          d[j] = n % 256;                //reset the current byte to the remainder (the carry amount will pass on the overflow)
          j++                            //iterate to the next byte
      }
  }
  while(j--)               //since the byte array is backwards, loop through it in reverse order
      b.push( d[j] );      //append each byte to the result
  return new Uint8Array(b) //return the final byte array in Uint8Array format
}
