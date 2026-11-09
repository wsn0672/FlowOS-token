import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blockedV4.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [['::', 96], ['::ffff:0:0', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001::', 32], ['2002::', 16]]) blockedV6.addSubnet(ip, bits, 'ipv6');
blockedV6.addAddress('::1', 'ipv6');

export function isPublicAddress (address) {
  const family = isIP(address);
  return family !== 0 && !(family === 4 ? blockedV4 : blockedV6).check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// Validate and use the same DNS result, avoiding a second lookup/rebinding window.
export function publicLookup (hostname, options, callback) {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
      return callback(new Error('Private proxy destinations are not allowed.'));
    }
    const matching = options.family ? addresses.filter(entry => entry.family === options.family) : addresses;
    if (!matching.length) return callback(new Error('No matching address family.'));
    if (options.all) callback(null, matching);
    else callback(null, matching[0].address, matching[0].family);
  });
}
