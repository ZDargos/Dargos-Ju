import { updateSettings } from '../lib/store';
import type { LearnLang } from '../types';

/**
 * First screen for a new account: choose what to learn. Written in both languages, since we
 * don't know yet which one the person reads.
 */
export default function Welcome() {
  const choose = (learning: LearnLang) => updateSettings({ learning, onboarded: true });
  return (
    <div className="main">
      <div className="login" style={{ textAlign: 'center' }}>
        <div className="brand-mark" style={{ width: 56, height: 56, fontSize: 32, borderRadius: 16, margin: '0 auto' }} aria-hidden>句</div>
        <h1 style={{ margin: '14px 0 4px' }}>Dargos Ju</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          <span lang="en">What do you want to learn?</span>
          <br />
          <span lang="zh-CN" className="zh">你想学什么？</span>
        </p>
        <div className="stack">
          <button className="btn primary block welcome-choice" onClick={() => choose('zh')}>
            <span lang="en">I want to learn Chinese</span>
            <span className="small" lang="zh-CN">我想学中文</span>
          </button>
          <button className="btn primary block welcome-choice" onClick={() => choose('en')}>
            <span lang="zh-CN" className="zh">我想学英语</span>
            <span className="small" lang="en">I want to learn English</span>
          </button>
        </div>
        <p className="small muted">
          <span lang="en">You can switch any time in Settings.</span>
          <br />
          <span lang="zh-CN">之后可以随时在设置里切换。</span>
        </p>
      </div>
    </div>
  );
}
