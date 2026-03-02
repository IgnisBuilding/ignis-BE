import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    // Anonymous evacuee tokens (Android app) have no DB user row
    if (payload.role === 'evacuee' && payload.device_id) {
      return { userId: payload.sub, email: '', role: 'evacuee', device_id: payload.device_id };
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) throw new UnauthorizedException();
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
