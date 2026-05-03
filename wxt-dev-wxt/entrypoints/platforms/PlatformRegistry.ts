import { BasePlatform } from './BasePlatform';
import { EpicPlatform } from './EpicPlatform';
import { AmazonPlatform } from './AmazonPlatform';
import { SteamPlatform } from './SteamPlatform';
import { GogPlatform } from './GogPlatform';
import { PlatformId } from './BasePlatform';

export class PlatformRegistry {
  private platforms = new Map<PlatformId, BasePlatform>();

  constructor() {
    this.register(new EpicPlatform());
    this.register(new AmazonPlatform());
    this.register(new SteamPlatform());
    this.register(new GogPlatform());
  }

  register(platform: BasePlatform) {
    this.platforms.set(platform.id, platform);
  }

  get(id: PlatformId): BasePlatform | undefined {
    return this.platforms.get(id);
  }

  getAll(): BasePlatform[] {
    return Array.from(this.platforms.values());
  }
}

export const registry = new PlatformRegistry();
