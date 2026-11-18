// The MIVO Hub: where boutiques drop their packed parcels, and where the courier collects
// them all at once. Set MIVO_HUB_ADDRESS and MIVO_HUB_HOURS in the environment.
export function getHub() {
  return {
    address: process.env.MIVO_HUB_ADDRESS?.trim() || null,
    hours: process.env.MIVO_HUB_HOURS?.trim() || null,
  };
}
