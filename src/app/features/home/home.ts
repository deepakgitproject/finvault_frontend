import { Component, signal, inject, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LoginRequest, RegisterRequest } from '../../core/models/auth.models';

declare var VANTA: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  private router = inject(Router);
  
  private observer: IntersectionObserver | null = null;
  private navObserver: IntersectionObserver | null = null;
  private vantaEffect: any;
  activeSection = signal('home');
  showToast = signal(false);

  ngOnInit() {
    document.body.classList.add('vanta-active');
  }

  ngAfterViewInit() {
    // Vanta initialization
    try {
      this.vantaEffect = VANTA.NET({
        el: "#vanta-bg",
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        scaleMobile: 1.00,
        color: 0xff3f81,
        backgroundColor: 0x23153c,
        points: 7.00,
        maxDistance: 24.00,
        spacing: 20.00,
        showDots: true
      });
    } catch (e) {
      console.warn('Vanta initialization failed:', e);
    }

    // Existing IntersectionObserver logic
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          // Optional: stop observing once it has appeared
          // this.observer?.unobserve(entry.target); 
        }
      });
    }, {
      root: null,
      rootMargin: '0px',
      threshold: 0.15
    });

    document.querySelectorAll('.fade-up').forEach(el => {
      this.observer?.observe(el);
    });

    // Navigation scroll spy logic
    this.navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.activeSection.set(entry.target.id);
        }
      });
    }, {
      root: null,
      rootMargin: '-40% 0px -40% 0px', // Trigger when section is in the middle of screen
      threshold: 0
    });

    document.querySelectorAll('main[id], section[id]').forEach(section => {
      this.navObserver?.observe(section);
    });
  }

  ngOnDestroy() {
    document.body.classList.remove('vanta-active');
    if (this.vantaEffect) {
      this.vantaEffect.destroy();
    }
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.navObserver) {
      this.navObserver.disconnect();
    }
  }

  showComingSoon() {
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3000);
  }
}


