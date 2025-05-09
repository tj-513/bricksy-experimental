import { BehaviorSubject } from "rxjs/internal/BehaviorSubject";
import { distinctUntilChanged } from "rxjs/internal/operators/distinctUntilChanged";
import { map } from "rxjs/internal/operators/map";
import { Observable } from "rxjs/internal/Observable";
import { SetDataArg } from "./types";
import { DevtoolWrapper } from "./devtoolWrapper";

export class Brick<T> {

    private subject: BehaviorSubject<T>;
    private actions = new Map<string, (state: T, payload: unknown) => T>();
    private sideEffects = new Map<string, (args: unknown) => unknown>();
    private devtoolWrapper: DevtoolWrapper<T>;
    
    constructor(initialData: T) {
        this.subject = new BehaviorSubject(initialData);
        this.devtoolWrapper = DevtoolWrapper.initDevtools(initialData);
    }

    public static createBrick<T>(initialData: T): Brick<T> {
        return new Brick<T>(initialData);
    }

    /**
     * Updates the state of the Brick with new data or a transformation function.
     *
     * @param setDataArg - Either a new state object or a function to transform the current state.
     */
    public setData(setDataArg: SetDataArg<T>): void;
    public setData(setDataArg: SetDataArg<T>, action: string): void;
    public setData(setDataArg: SetDataArg<T>, action: string = 'SET_DATA'): void {
        if(setDataArg instanceof Function) {
            const newState = setDataArg(this.subject.value);
            this.subject.next(newState);
            this.devtoolWrapper?.send(action, newState);
            return;
        }
        if(setDataArg instanceof Object) {
            this.devtoolWrapper?.send(action, setDataArg);
            this.subject.next(setDataArg);
        }

    }

    public asObservable(): Observable<T> {
        return this.subject.asObservable();
    }

    /**
     * Selects a portion of the state or the entire state as an observable.
     *
     * @typeParam S - The type of the selected state if a selector is provided.
     */
    public select$(): Observable<T>;
    public select$<S>(selector: (source: T) => S): Observable<S>;
    public select$<S>(
        selector: (source: T) => S,
        comparator: (previous: S, current: S) => boolean
    ): Observable<S>;
    public select$<S>(
        selector?: (source: T) => S,
        comparator?: (previous: S, current: S) => boolean
      ): Observable<S> { 

        if(!selector){
            return this.subject.asObservable() as unknown as Observable<S>;
        } 

        return this.subject.pipe(
            map(selector),
            distinctUntilChanged(comparator),
        );
    }

    public get snapshot(): T {
        return this.subject.value;
    }

    /**
     * Registers an action with a reducer to update the state.
     *
     * @typeParam P - The type of the payload the reducer accepts.
     */
    public registerAction<P>(name: string, reducer: (state: T, payload: P)=> T): void {
        if(this.actions.has(name)){
            throw new Error(`Action with the name "${name}" is already registered.`);
        }
        this.actions.set(name, (state, payload) => reducer(state, payload as P));
    }

    /**
     * Registers a new side effect with a specified name.
     *
     * @param name - The name of the side effect to register.
     * @param effect - A function that performs a side effect when the associated action is dispatched.
     *
     * @typeParam P - The type of the payload that the side effect function accepts.
     *
     * @throws An error if a side effect with the same name is already registered.
     */
    public registerSideEffect<P>(name: string, effect: (payload: P) => void): void {
        if (this.sideEffects.has(name)) {
            throw new Error(`Side effect with the name "${name}" is already registered.`);
        }
        this.sideEffects.set(name, (payload) => effect(payload as P));
    }

    /**
     * Dispatches an action or triggers a side effect by its name.
     *
     * @remarks
     * - Executes the reducer to update the state if an action is registered.
     * - Executes the side effect if one is registered with the same name.
     */
    public dispatch(action: string, payload: unknown): void {
        const reducer = this.actions.get(action);
        const sideEffect = this.sideEffects.get(action);
        if (typeof reducer === 'function') {
            this.setData((state) => reducer(state, payload), action);
        }
        if (typeof sideEffect === 'function') {
            sideEffect(payload);
            this.devtoolWrapper?.send(action, {type: 'sideEffect', payload});
        }
    }

}