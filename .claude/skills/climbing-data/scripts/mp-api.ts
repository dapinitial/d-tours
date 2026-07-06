#!/usr/bin/env node
// ============================================================================
// DEV-TIME RESEARCH ONLY — DO NOT IMPORT FROM PRODUCT CODE.
//
// Vendored from github.com/onXmaps/mp-tools (plugins/mp-tools/skills/api-client/
// scripts/mp-api.ts). Hits Mountain Project's private mobile API anonymously.
// Not licensed for product use: personal dossier research and schema study only.
// The product-safe climbing-data source is OpenBeta (see openbeta.mjs).
// ============================================================================
/**
 * Mountain Project API Client
 *
 * A command-line tool for interacting with the Mountain Project API.
 * Supports various endpoints including getPhotosTopos, getPhotos, getTicks, etc.
 *
 * Usage:
 *   npx tsx mp-api.ts <action> [options]
 *
 * Examples:
 *   npx tsx mp-api.ts getPhotosTopos --areaId 105717538
 *   npx tsx mp-api.ts getPhotosTopos --routeId 105717329
 *   npx tsx mp-api.ts getPhotos --areaId 105717538
 *   npx tsx mp-api.ts getPackageList
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// API Configuration
const BASE_URL = 'https://www.mountainproject.com/api';
const API_VERSION = 2;
const OS = 'iOS';
const OS_VERSION = '18.0';
// Generate a stable device ID for this session
const DEVICE_ID = process.env.MP_DEVICE_ID || '00000000-0000-0000-0000-000000000000';
const APP_VERSION = '4.5.0';

interface ApiParams {
  [key: string]: string | number;
}

interface ApiOptions {
  method?: 'GET' | 'POST';
  params?: ApiParams;
  baseUrl?: string;
}

/**
 * Make an API call to Mountain Project
 */
async function callApi(action: string, options: ApiOptions = {}): Promise<any> {
  const { method = 'GET', params = {}, baseUrl = BASE_URL } = options;

  // Build query parameters
  const queryParams: ApiParams = {
    action,
    apiVersion: API_VERSION,
    os: OS,
    osVersion: OS_VERSION,
    deviceId: DEVICE_ID,
    v: APP_VERSION,
    ...params,
  };

  const query = Object.entries(queryParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const urlString = `${baseUrl}?${query}`;
  const url = new URL(urlString);

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      method,
      headers: {
        'User-Agent': 'MountainProject-iOS/4.5.0',
        'Accept': 'application/json',
      },
    };

    const req = client.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Get photos and topos for an area or route
 */
async function getPhotosTopos(id: number, type: 'area' | 'route'): Promise<any> {
  const params: ApiParams = {};
  if (type === 'area') {
    params.areaId = id;
  } else {
    params.routeId = id;
  }

  return callApi('getPhotosTopos', { params });
}

/**
 * Get photos for an area or route
 */
async function getPhotos(id: number, type: 'area' | 'route'): Promise<any> {
  const params: ApiParams = {};
  if (type === 'area') {
    params.areaId = id;
  } else {
    params.routeId = id;
  }

  return callApi('getPhotos', { params });
}

/**
 * Get ticks for a route
 */
async function getTicks(routeId: number): Promise<any> {
  return callApi('getTicks', { params: { routeId } });
}

/**
 * Get list of available packages
 */
async function getPackageList(): Promise<any> {
  return callApi('getPackageList');
}

/**
 * Get package ID for an area
 */
async function getPackageForArea(areaId: number): Promise<any> {
  return callApi('getPackageForArea', { params: { id: areaId } });
}

/**
 * Get package ID for a route
 */
async function getPackageForRoute(routeId: number): Promise<any> {
  return callApi('getPackageForRoute', { params: { id: routeId } });
}

/**
 * Get route info
 */
async function getRouteInfo(routeIds: number[]): Promise<any> {
  const idsParam = routeIds.join(',');
  return callApi('getRouteInfo', {
    method: 'POST',
    params: { routeIds: idsParam },
  });
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx mp-api.ts <action> [options]');
    console.error('\nAvailable actions:');
    console.error('  getPhotosTopos --areaId <id> | --routeId <id>');
    console.error('  getPhotos --areaId <id> | --routeId <id>');
    console.error('  getTicks --routeId <id>');
    console.error('  getPackageList');
    console.error('  getPackageForArea --areaId <id>');
    console.error('  getPackageForRoute --routeId <id>');
    console.error('  getRouteInfo --routeIds <id1,id2,...>');
    process.exit(1);
  }

  const action = args[0];
  const options: { [key: string]: string } = {};

  // Parse options
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = value;
  }

  try {
    let result: any;

    switch (action) {
      case 'getPhotosTopos':
        if (options.areaId) {
          result = await getPhotosTopos(parseInt(options.areaId), 'area');
        } else if (options.routeId) {
          result = await getPhotosTopos(parseInt(options.routeId), 'route');
        } else {
          throw new Error('Must provide --areaId or --routeId');
        }
        break;

      case 'getPhotos':
        if (options.areaId) {
          result = await getPhotos(parseInt(options.areaId), 'area');
        } else if (options.routeId) {
          result = await getPhotos(parseInt(options.routeId), 'route');
        } else {
          throw new Error('Must provide --areaId or --routeId');
        }
        break;

      case 'getTicks':
        if (!options.routeId) {
          throw new Error('Must provide --routeId');
        }
        result = await getTicks(parseInt(options.routeId));
        break;

      case 'getPackageList':
        result = await getPackageList();
        break;

      case 'getPackageForArea':
        if (!options.areaId) {
          throw new Error('Must provide --areaId');
        }
        result = await getPackageForArea(parseInt(options.areaId));
        break;

      case 'getPackageForRoute':
        if (!options.routeId) {
          throw new Error('Must provide --routeId');
        }
        result = await getPackageForRoute(parseInt(options.routeId));
        break;

      case 'getRouteInfo':
        if (!options.routeIds) {
          throw new Error('Must provide --routeIds (comma-separated)');
        }
        const ids = options.routeIds.split(',').map(id => parseInt(id.trim()));
        result = await getRouteInfo(ids);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export functions for programmatic use
export {
  callApi,
  getPhotosTopos,
  getPhotos,
  getTicks,
  getPackageList,
  getPackageForArea,
  getPackageForRoute,
  getRouteInfo,
};
