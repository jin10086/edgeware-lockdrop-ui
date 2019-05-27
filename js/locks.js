let provider, web3;
const MAINNET_LOCKDROP = '0x1b75b90e60070d37cfa9d87affd124bb345bf70a';
const ROPSTEN_LOCKDROP = '0x111ee804560787E0bFC1898ed79DAe24F2457a04';
const LOCKDROP_ABI = JSON.stringify([{"constant":true,"inputs":[],"name":"LOCK_START_TIME","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"LOCK_END_TIME","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"LOCK_DROP_PERIOD","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"_origin","type":"address"},{"name":"_nonce","type":"uint32"}],"name":"addressFrom","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":false,"inputs":[{"name":"contractAddr","type":"address"},{"name":"nonce","type":"uint32"},{"name":"edgewareAddr","type":"bytes"}],"name":"signal","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"term","type":"uint8"},{"name":"edgewareAddr","type":"bytes"},{"name":"isValidator","type":"bool"}],"name":"lock","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"inputs":[{"name":"startTime","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":false,"name":"eth","type":"uint256"},{"indexed":false,"name":"lockAddr","type":"address"},{"indexed":false,"name":"term","type":"uint8"},{"indexed":false,"name":"edgewareAddr","type":"bytes"},{"indexed":false,"name":"isValidator","type":"bool"},{"indexed":false,"name":"time","type":"uint256"}],"name":"Locked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"contractAddr","type":"address"},{"indexed":false,"name":"edgewareAddr","type":"bytes"},{"indexed":false,"name":"time","type":"uint256"}],"name":"Signaled","type":"event"}]);

$(function() {
  $('input[name="network"]').change(function(e) {
    let network = $('input[name="network"]:checked').val();
    if (network === 'mainnet') {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(MAINNET_LOCKDROP);
    } else if (network === 'ropsten') {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(ROPSTEN_LOCKDROP);
    } else {
      $('#LOCKDROP_CONTRACT_ADDRESS').val(MAINNET_LOCKDROP);
    }
  });

  $('#LOCK_LOOKUP_BTN').click(async function() {
    let addr = $('#LOCKDROP_PARTICIPANT_ADDRESS').val();
    // Sanitise address input
    if (!isHex(addr)) {
      alert('You must input a valid hex encoded Ethereum address')
      return;
    } else if ((addr.length !== 42 && addr.indexOf('0x') !== -1) || 
        (addr.length !== 40 && addr.indexOf('0x') === -1)) {
      alert('You must input a valid lengthed Ethereum address')
      return;
    } else {
      if (addr.length === 40) {
        addr = `0x${addr}`;
      }
    }
    setupWeb3Provider();
    let lockdropContractAddress = $('#LOCKDROP_CONTRACT_ADDRESS').val();
    const json = await $.getJSON('Lockdrop.json');
    const contract = new web3.eth.Contract(json.abi, lockdropContractAddress);
    const lockEvents = await getLocks(contract, addr);
    const signalEvents = await getSignals(contract, addr);
    const now = await getCurrentTimestamp();

    let promises = lockEvents.map(async event => {
      let lockStorage = await getLockStorage(event.returnValues.lockAddr);
      return {
        owner: event.returnValues.owner,
        eth: web3.utils.fromWei(event.returnValues.eth, 'ether'),
        lockContractAddr: event.returnValues.lockAddr,
        term: event.returnValues.term,
        edgewarePublicKeys: event.returnValues.edgewareKey,
        unlockTime: `${(lockStorage.unlockTime - now) / 60} minutes`,
      };
    });
  
    let results = await Promise.all(promises);
    results.map(r => {
      let listElt = $([
        '<li>',
        '   <div>',
        `     <p>Owner: ${r.owner}</p>`,
        `     <p>ETH Locked: ${r.eth}</p>`,
        `     <p>LUC Address: ${r.lockContractAddr}</p>`,
        `     <p>Term Length: ${(r.term === 0) ? '3 months' : (r.term === 1) ? '6 months' : '12 months'}</p>`,
        `     <p>EDG Keys: ${r.edgewarePublicKeys}</p>`,
        `     <p>Unlock Time: ${r.unlockTime}</p>`,
        '   </div>',
        '</li>',
      ].join('\n'));
      $('#LOCK_LOOKUP_RESULTS').append(listElt);
    });
  });
});

function isHex(inputString) {
  const re = /^(0x)?[0-9A-Fa-f]+$/g;
  const result = re.test(inputString);
  re.lastIndex = 0;
  return result;
}

/**
 * Setup web3 provider using InjectedWeb3's injected providers
 */
function setupWeb3Provider() {
  // Setup web3 provider
  if (typeof window.ethereum !== 'undefined' || (typeof window.web3 !== 'undefined')) {
    // Web3 browser user detected. You can now use the provider.
    provider = window.ethereum || window.web3.currentProvider;
  } else {
    provider = new Web3.providers.HttpProvider('https://mainnet.infura.io');
  }

  web3 = new window.Web3(provider);
}

/**
 * Enable connection between browser and InjectedWeb3
 */
async function enableInjectedWeb3EthereumConnection() {
  try {
    await ethereum.enable();
  } catch (error) {
    // Handle error. Likely the user rejected the login:
    alert('Could not find Web3 provider/Ethereum wallet');
  }
}

const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

const getSignals = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      contractAddr: address,
    }
  });
};

const getLockStorage = async (lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: web3.utils.hexToNumber(vals[1]),
    };
  });
};

const getCurrentTimestamp = async () => {
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
};